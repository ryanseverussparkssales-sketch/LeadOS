<script lang="ts">
	import { titleFor } from '$lib/brand';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { streamChat, probeEngine, resetEngineProbe, type ChatImage } from '$lib/assistant/engine';

	/**
	 * Assistant — RogueOS in-app AI assistant (Wave B1: real engine + browser voice).
	 *
	 * Streaming is delegated to `$lib/assistant/engine` (`probeEngine()` +
	 * `streamChat(...)`), which auto-selects the LOCAL Guppy runtime when reachable
	 * and transparently falls through to the CLOUD Claude route otherwise. The
	 * engine badge reflects `probeEngine()` and any mid-stream local→cloud fallback.
	 *
	 * Browser voice (dictation via Web Speech `SpeechRecognition`, read-aloud via
	 * `speechSynthesis`) is a client-only affordance — no backend, no new deps —
	 * scoped to the local experience and hard-guarded for SSR / unsupported browsers.
	 */

	type Role = 'user' | 'assistant';
	interface ChatMessage {
		role: Role;
		content: string;
		source?: string;
		toolChips?: string[];
		images?: ChatImage[];
	}

	// Vision limits — mirrored from the cloud route so we fail fast client-side.
	const MAX_IMAGES = 4;
	const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
	const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

	// 'cloud' | 'local' — fed by probeEngine() on mount and after each turn, and
	// flipped to 'cloud' if a turn falls back local→cloud mid-stream.
	let engineMode = $state<'cloud' | 'local'>('cloud');

	let messages = $state<ChatMessage[]>([]);
	let draft = $state('');
	let streaming = $state(false);
	let waitingFirstToken = $state(false);

	let scrollEl: HTMLDivElement | undefined = $state();
	let composerEl: HTMLTextAreaElement | undefined = $state();
	let abort: AbortController | null = null;

	// ── drop-a-note quick capture ──────────────────────────────
	let noteOpen = $state(false);
	let noteText = $state('');

	// ── pending image attachments (vision) ─────────────────────
	let pendingImages = $state<ChatImage[]>([]);
	let dragOver = $state(false);
	let capturingScreen = $state(false);
	// Whether screen capture is available in this browser (feature-guarded).
	let screenCaptureSupported = $state(false);

	// ── lightweight toast ──────────────────────────────────────
	let toastMsg = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	function toast(msg: string) {
		toastMsg = msg;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			toastMsg = '';
			toastTimer = null;
		}, 3200);
	}

	// Return focus to the composer without stealing it during typing/streaming.
	function focusComposer() {
		if (typeof window === 'undefined') return;
		try {
			composerEl?.focus();
		} catch {
			/* ignore */
		}
	}

	const quickActions = [
		"Today's agenda",
		'Pipeline this month',
		'Draft a follow-up',
		'Log my last call'
	];

	// ── autoscroll ─────────────────────────────────────────────
	// Re-runs whenever the transcript changes (new message or streamed token).
	$effect(() => {
		// touch the reactive deps so the effect tracks them
		const _len = messages.length;
		const _last = messages[messages.length - 1]?.content;
		void _len;
		void _last;
		if (scrollEl) {
			scrollEl.scrollTop = scrollEl.scrollHeight;
		}
	});

	// ── engine probe ───────────────────────────────────────────
	async function refreshEngineMode() {
		try {
			engineMode = await probeEngine();
		} catch {
			engineMode = 'cloud';
		}
	}

	// Read the optional local engine token (Wave B2 settings UI writes it).
	function localToken(): string | undefined {
		if (typeof localStorage === 'undefined') return undefined;
		try {
			return localStorage.getItem('guppy_local_token') ?? undefined;
		} catch {
			return undefined;
		}
	}

	// ── browser voice (Web Speech) ─────────────────────────────
	// All Web Speech usage is guarded with typeof/feature checks so SSR and
	// unsupported browsers never crash.
	let ttsEnabled = $state(false);
	let listening = $state(false);
	let voiceHint = $state('');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let recognition: any = null;

	// Speech-recognition support (used to gate the mic button, alongside local mode).
	let speechRecognitionSupported = $state(false);

	function speechRecognitionCtor(): (new () => unknown) | null {
		if (typeof window === 'undefined') return null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const w = window as any;
		return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
	}

	// Mic is shown only when SpeechRecognition exists AND we're in local mode.
	let micVisible = $derived(speechRecognitionSupported && engineMode === 'local');

	// TTS is offered whenever the browser supports speechSynthesis.
	let ttsSupported = $state(false);

	function stripMarkdown(text: string): string {
		return text
			.replace(/```[\s\S]*?```/g, ' code block ')
			.replace(/`([^`]+)`/g, '$1')
			.replace(/\*\*([^*]+)\*\*/g, '$1')
			.replace(/\*([^*]+)\*/g, '$1')
			.replace(/__([^_]+)__/g, '$1')
			.replace(/#{1,6}\s+/g, '')
			.replace(/^[-*+]\s+/gm, '')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/[>|]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function cancelSpeech() {
		if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
		try {
			window.speechSynthesis.cancel();
		} catch {
			/* ignore */
		}
	}

	function speak(text: string) {
		if (!ttsEnabled) return;
		if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
		const clean = stripMarkdown(text);
		if (!clean) return;
		try {
			window.speechSynthesis.cancel();
			const u = new SpeechSynthesisUtterance(clean);
			window.speechSynthesis.speak(u);
		} catch {
			/* ignore */
		}
	}

	function toggleTts() {
		ttsEnabled = !ttsEnabled;
		if (typeof localStorage !== 'undefined') {
			try {
				localStorage.setItem('assistant_tts', ttsEnabled ? '1' : '0');
			} catch {
				/* ignore */
			}
		}
		if (!ttsEnabled) cancelSpeech();
	}

	function stopListening() {
		listening = false;
		if (recognition) {
			try {
				recognition.stop();
			} catch {
				/* ignore */
			}
		}
	}

	function toggleMic() {
		if (listening) {
			stopListening();
			return;
		}
		const Ctor = speechRecognitionCtor();
		if (!Ctor) {
			voiceHint = 'Voice input is not supported in this browser.';
			return;
		}
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const rec: any = new (Ctor as any)();
			recognition = rec;
			rec.lang = 'en-US';
			rec.interimResults = true;
			rec.continuous = false;
			voiceHint = '';

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			rec.onresult = (event: any) => {
				let text = '';
				for (let i = 0; i < event.results.length; i += 1) {
					text += event.results[i][0].transcript;
				}
				draft = text;
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			rec.onerror = (event: any) => {
				listening = false;
				if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
					voiceHint = 'Microphone permission denied — enable it in your browser settings.';
				} else if (event?.error === 'no-speech') {
					voiceHint = "Didn't catch that — try again.";
				} else {
					voiceHint = 'Voice input stopped.';
				}
			};
			rec.onend = () => {
				listening = false;
			};

			listening = true;
			rec.start();
		} catch {
			listening = false;
			voiceHint = 'Could not start voice input.';
		}
	}

	// ── mount: probe engine + restore voice prefs ──────────────
	$effect(() => {
		// One-shot init (untracked reactive writes).
		if (typeof window !== 'undefined') {
			speechRecognitionSupported = speechRecognitionCtor() !== null;
			ttsSupported = 'speechSynthesis' in window;
			screenCaptureSupported =
				typeof navigator !== 'undefined' &&
				!!navigator.mediaDevices &&
				typeof navigator.mediaDevices.getDisplayMedia === 'function';
			if (typeof localStorage !== 'undefined') {
				try {
					ttsEnabled = localStorage.getItem('assistant_tts') === '1';
				} catch {
					/* ignore */
				}
			}
			// Handoff from Call Review ("✦ Discuss with Assistant"): pre-fill the
			// composer with the stashed seed prompt but DO NOT auto-send — the user
			// may want to attach a screenshot first. Consume the key once.
			if (typeof sessionStorage !== 'undefined') {
				try {
					const seed = sessionStorage.getItem('assistant_seed');
					if (seed) {
						sessionStorage.removeItem('assistant_seed');
						if (!draft) draft = seed;
					}
				} catch {
					/* ignore */
				}
			}
		}
		void refreshEngineMode();
	});

	// ── send ───────────────────────────────────────────────────
	function send(text: string, images: ChatImage[] = []) {
		const content = text.trim();
		// Allow an image-only turn (no text) but never an empty one.
		if ((!content && images.length === 0) || streaming) return;

		// New turn — silence any in-flight read-aloud.
		cancelSpeech();

		const userMsg: ChatMessage = { role: 'user', content };
		if (images.length > 0) userMsg.images = images;
		messages.push(userMsg);
		const assistant: ChatMessage = { role: 'assistant', content: '', toolChips: [] };
		messages.push(assistant);
		const idx = messages.length - 1;

		// Build the history the engine sees: user+assistant only, last ~20 turns,
		// mapped to the {role, content, images?} contract. Drop empty-content
		// messages UNLESS they carry images (image-only user turns are valid), so
		// the backend still ends on the real user turn.
		const history = messages
			.filter(
				(m) =>
					(m.role === 'user' || m.role === 'assistant') &&
					(m.content.trim().length > 0 || (m.images?.length ?? 0) > 0),
			)
			.slice(-20)
			.map((m) => ({ role: m.role, content: m.content, images: m.images }));

		draft = '';
		streaming = true;
		waitingFirstToken = true;
		abort = new AbortController();
		const signal = abort.signal;

		const handlers = {
			onToken: (t: string) => {
				waitingFirstToken = false;
				messages[idx].content += t;
			},
			onSource: (src: string) => {
				messages[idx].source = src;
				// Mid-stream fallback local→cloud: keep the badge honest.
				if (src.startsWith('cloud')) engineMode = 'cloud';
			},
			onToolChip: (name: string) => {
				const chips = messages[idx].toolChips ?? [];
				if (!chips.includes(name)) messages[idx].toolChips = [...chips, name];
			},
			onDone: () => {
				streaming = false;
				waitingFirstToken = false;
				abort = null;
				// Read the finished reply aloud when TTS is on.
				speak(messages[idx].content);
				// Cheap re-probe (module caches ~30s) so the badge stays current.
				void refreshEngineMode();
				// Stop button just disappeared — return focus to the composer.
				focusComposer();
			},
			onError: (err: unknown) => {
				streaming = false;
				waitingFirstToken = false;
				abort = null;
				messages[idx].content += `\n\n⚠️ ${err instanceof Error ? err.message : String(err) || 'Something went wrong.'}`;
				focusComposer();
			}
		};

		void streamChat(history, handlers, { signal, localToken: localToken() });
	}

	function stop() {
		if (abort) abort.abort();
		cancelSpeech();
		streaming = false;
		waitingFirstToken = false;
		abort = null;
		// Stop button just disappeared — return focus to the composer.
		focusComposer();
	}

	function onQuickAction(label: string) {
		draft = label;
		send(label);
	}

	function onSubmit() {
		if (streaming) return;
		const imgs = pendingImages;
		pendingImages = [];
		send(draft, imgs);
	}

	// ── drop-a-note actions ────────────────────────────────────
	function toggleNote() {
		noteOpen = !noteOpen;
		if (!noteOpen) noteText = '';
	}

	// Save the note via the tool-enabled assistant. We send a plain user turn that
	// instructs the model to call create_note; it persists via the normal tool path
	// and confirms. "brainstorm" appends an ask to riff on it afterwards.
	function saveNote(brainstorm: boolean) {
		const text = noteText.trim();
		if (!text || streaming) return;
		const instruction = brainstorm
			? `Save this as a CRM note (call the create_note tool), then brainstorm follow-ups and next steps on it:\n\n"${text}"`
			: `Save this as a CRM note by calling the create_note tool, then confirm it's saved:\n\n"${text}"`;
		noteText = '';
		noteOpen = false;
		toast(brainstorm ? 'Saving note & brainstorming…' : 'Saving note to CRM…');
		send(instruction);
	}

	// ── image attachment helpers ───────────────────────────────
	// Convert a data URL to our { mediaType, dataBase64 } wire shape (prefix stripped).
	function dataUrlToImage(dataUrl: string): ChatImage | null {
		const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
		if (!m) return null;
		return { mediaType: m[1], dataBase64: m[2] };
	}

	function addImage(img: ChatImage): boolean {
		if (!ALLOWED_IMAGE_TYPES.has(img.mediaType)) {
			toast('Unsupported image type — use PNG, JPEG, WebP, or GIF.');
			return false;
		}
		// base64 length → approximate decoded byte size (×3/4).
		if (img.dataBase64.length * 0.75 > MAX_IMAGE_BYTES) {
			toast('Image too large — max 5MB each.');
			return false;
		}
		if (pendingImages.length >= MAX_IMAGES) {
			toast(`You can attach up to ${MAX_IMAGES} images.`);
			return false;
		}
		pendingImages = [...pendingImages, img];
		return true;
	}

	function removeImage(i: number) {
		pendingImages = pendingImages.filter((_, idx) => idx !== i);
	}

	function fileToImage(file: File): Promise<void> {
		return new Promise((resolve) => {
			if (!file.type.startsWith('image/')) {
				resolve();
				return;
			}
			const reader = new FileReader();
			reader.onload = () => {
				const img = typeof reader.result === 'string' ? dataUrlToImage(reader.result) : null;
				if (img) addImage(img);
				resolve();
			};
			reader.onerror = () => resolve();
			reader.readAsDataURL(file);
		});
	}

	async function addFiles(files: FileList | File[]) {
		const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
		for (const f of list) {
			// eslint-disable-next-line no-await-in-loop
			await fileToImage(f);
		}
	}

	// (a) Capture screen → one frame from getDisplayMedia, stopped immediately.
	async function captureScreen() {
		if (streaming || capturingScreen) return;
		if (
			typeof navigator === 'undefined' ||
			!navigator.mediaDevices ||
			typeof navigator.mediaDevices.getDisplayMedia !== 'function'
		) {
			toast('Screen capture is not supported in this browser.');
			return;
		}
		if (pendingImages.length >= MAX_IMAGES) {
			toast(`You can attach up to ${MAX_IMAGES} images.`);
			return;
		}
		capturingScreen = true;
		let stream: MediaStream | null = null;
		try {
			stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
			const track = stream.getVideoTracks()[0];
			const video = document.createElement('video');
			video.srcObject = stream;
			video.muted = true;
			await video.play();
			// Give the frame a beat to paint before grabbing it.
			await new Promise((r) => setTimeout(r, 180));
			const w = video.videoWidth || 1280;
			const h = video.videoHeight || 720;
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const cctx = canvas.getContext('2d');
			if (cctx) cctx.drawImage(video, 0, 0, w, h);
			// Stop capture immediately — we only wanted a single frame.
			track?.stop();
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
			const dataUrl = canvas.toDataURL('image/png');
			const img = dataUrlToImage(dataUrl);
			if (img && addImage(img)) toast('Screen captured — attached.');
		} catch (e) {
			if (stream) stream.getTracks().forEach((t) => t.stop());
			const name = e instanceof Error ? e.name : '';
			if (name === 'NotAllowedError') toast('Screen capture cancelled.');
			else toast('Could not capture the screen.');
		} finally {
			capturingScreen = false;
		}
	}

	// (b) Drag-and-drop onto the composer/dropzone.
	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) void addFiles(files);
	}
	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}
	function onDragLeave() {
		dragOver = false;
	}

	// (c) Paste image from clipboard.
	function onPaste(e: ClipboardEvent) {
		const items = e.clipboardData?.items;
		if (!items) return;
		const imgFiles: File[] = [];
		for (let i = 0; i < items.length; i += 1) {
			const it = items[i];
			if (it.kind === 'file' && it.type.startsWith('image/')) {
				const f = it.getAsFile();
				if (f) imgFiles.push(f);
			}
		}
		if (imgFiles.length > 0) {
			e.preventDefault();
			void addFiles(imgFiles);
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (!streaming) onSubmit();
		}
	}
</script>

<svelte:head>
	<title>{titleFor('Assistant')}</title>
</svelte:head>

<div class="flex flex-col h-full min-h-0">
	<PageHeader title="Assistant" subtitle="Ask about your pipeline, draft outreach, or log a call.">
		{#snippet actions()}
			<div
				class="flex items-center gap-2 rounded-full border border-[#1a1a1a] bg-[#0d0d0d] px-3 py-1.5"
				title="Which engine is answering"
				role="status"
				aria-label={engineMode === 'local'
					? 'AI engine: local (Hermes 36B)'
					: 'AI engine: cloud (Claude)'}
			>
				{#if engineMode === 'local'}
					<span class="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_6px_rgba(200,162,74,0.7)]" aria-hidden="true"></span>
					<span class="text-xs text-[#c9c9c9]">Local engine · Hermes 36B</span>
				{:else}
					<span class="w-2 h-2 rounded-full bg-[var(--c-text-muted)]" aria-hidden="true"></span>
					<span class="text-xs text-[#c9c9c9]">Cloud · Claude</span>
				{/if}
			</div>
		{/snippet}
	</PageHeader>

	<!-- Transcript -->
	<div bind:this={scrollEl} class="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-6">
		{#if messages.length === 0}
			<EmptyState
				icon="✦"
				title="Ask me about your pipeline, draft outreach, or log a call."
				hint="Your messages stay inside RogueOS."
			/>
		{:else}
			<div class="mx-auto max-w-3xl flex flex-col gap-4">
				{#each messages as msg, i (i)}
					{#if msg.role === 'user'}
						<div class="flex justify-end">
							<div
								class="max-w-[85%] rounded-2xl rounded-br-sm border border-[#262626] bg-[#141414] px-4 py-2.5 text-sm text-[#e8e8e8] whitespace-pre-wrap break-words"
							>
								{#if msg.images && msg.images.length > 0}
									<div class="mb-2 flex flex-wrap gap-2">
										{#each msg.images as img, ii (ii)}
											<img
												src={`data:${img.mediaType};base64,${img.dataBase64}`}
												alt="Attached image"
												class="h-24 w-24 rounded-lg border border-[#262626] object-cover"
											/>
										{/each}
									</div>
								{/if}
								{#if msg.content}{msg.content}{/if}
							</div>
						</div>
					{:else}
						<div class="flex justify-start">
							<div class="max-w-[85%] flex flex-col gap-1.5">
								{#if msg.toolChips && msg.toolChips.length > 0}
									<div class="flex flex-wrap gap-1.5" role="list" aria-label="Tools used">
										{#each msg.toolChips as chip (chip)}
											<span
												role="listitem"
												aria-label={`used tool ${chip}`}
												class="inline-flex items-center gap-1 rounded-full border border-[#1a1a1a] bg-[#0d0d0d] px-2 py-0.5 text-[11px] text-[#8a8a8a]"
											>
												<span aria-hidden="true">🔧 {chip}…</span>
											</span>
										{/each}
									</div>
								{/if}
								<div
									aria-live="polite"
									aria-atomic="false"
									class="rounded-2xl rounded-bl-sm border border-[#1a1a1a] bg-[#0d0d0d] px-4 py-2.5 text-sm text-[#d6d6d6] whitespace-pre-wrap break-words"
								>
									{#if msg.content}
										{msg.content}
									{:else if streaming && waitingFirstToken && i === messages.length - 1}
										<span class="inline-flex items-center gap-1 text-[#6e6e6e]">
											<span class="w-1.5 h-1.5 rounded-full bg-[#6e6e6e] animate-pulse" aria-hidden="true"></span>
											thinking…
										</span>
									{/if}
								</div>
								{#if msg.source}
									<p class="text-[11px] text-[#5a5a5a] pl-1">via {msg.source}</p>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<!-- Composer -->
	<div class="border-t border-[#1e1e1e] px-4 sm:px-8 py-4 shrink-0">
		<div class="mx-auto max-w-3xl">
			{#if toastMsg}
				<div
					role="status"
					class="mb-3 rounded-lg border border-[#262626] bg-[#141414] px-3 py-2 text-xs text-[#c9c9c9]"
				>
					{toastMsg}
				</div>
			{/if}

			<!-- Drop-a-note quick capture -->
			{#if noteOpen}
				<div class="mb-3 rounded-xl border border-[#262626] bg-[#0d0d0d] p-3">
					<label for="dropnote" class="mb-1.5 block text-[11px] uppercase tracking-wide text-[#8a8a8a]">
						Drop a note
					</label>
					<textarea
						id="dropnote"
						bind:value={noteText}
						rows="2"
						placeholder="Jot a quick note — it saves to the CRM…"
						class="w-full resize-none rounded-lg border border-[#262626] bg-[#111] px-3 py-2 text-sm text-[#e8e8e8] placeholder:text-[#5a5a5a] focus:outline-none focus:border-[#3a3a3a]"
					></textarea>
					<div class="mt-2 flex items-center justify-end gap-2">
						<button
							type="button"
							onclick={toggleNote}
							class="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-3 py-1.5 text-xs text-[#8a8a8a] transition-colors hover:border-[#262626] hover:text-[#c9c9c9]"
						>
							Cancel
						</button>
						<button
							type="button"
							disabled={!noteText.trim() || streaming}
							onclick={() => saveNote(true)}
							class="rounded-lg border border-[#262626] bg-[#141414] px-3 py-1.5 text-xs text-[#d6d6d6] transition-colors hover:border-[#3a3a3a] disabled:opacity-40 disabled:cursor-not-allowed"
						>
							Save &amp; brainstorm
						</button>
						<button
							type="button"
							disabled={!noteText.trim() || streaming}
							onclick={() => saveNote(false)}
							class="rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition-colors hover:border-[var(--accent-hi)] hover:bg-[var(--accent-hi)] disabled:opacity-40 disabled:cursor-not-allowed"
						>
							Save note
						</button>
					</div>
				</div>
			{/if}

			<!-- Pending image attachments tray -->
			{#if pendingImages.length > 0}
				<div class="mb-3 flex flex-wrap gap-2" aria-label="Attached images">
					{#each pendingImages as img, i (i)}
						<div class="relative">
							<img
								src={`data:${img.mediaType};base64,${img.dataBase64}`}
								alt="Attachment preview"
								class="h-16 w-16 rounded-lg border border-[#262626] object-cover"
							/>
							<button
								type="button"
								onclick={() => removeImage(i)}
								aria-label="Remove image"
								title="Remove image"
								class="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[#3a3a3a] bg-[#141414] text-[11px] text-[#c9c9c9] transition-colors hover:border-rose-700 hover:text-rose-300"
							>
								<span aria-hidden="true">×</span>
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Quick-action chips -->
			<div class="flex flex-wrap gap-2 mb-3">
				<button
					type="button"
					disabled={streaming}
					onclick={toggleNote}
					aria-pressed={noteOpen}
					class="rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed {noteOpen
						? 'border-[var(--accent)]/70 bg-[var(--accent)]/10 text-[var(--accent-hi)]'
						: 'border-[#1a1a1a] bg-[#0d0d0d] text-[#a8a8a8] hover:border-[#262626] hover:text-[#e0e0e0]'}"
				>
					＋ Note
				</button>
				{#if screenCaptureSupported}
					<button
						type="button"
						disabled={streaming || capturingScreen}
						onclick={captureScreen}
						title="Capture your screen and attach it"
						class="rounded-full border border-[#1a1a1a] bg-[#0d0d0d] px-3 py-1.5 text-xs text-[#a8a8a8] transition-colors hover:border-[#262626] hover:text-[#e0e0e0] disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{capturingScreen ? 'Capturing…' : '🖥 Capture screen'}
					</button>
				{/if}
				{#each quickActions as label (label)}
					<button
						type="button"
						disabled={streaming}
						onclick={() => onQuickAction(label)}
						class="rounded-full border border-[#1a1a1a] bg-[#0d0d0d] px-3 py-1.5 text-xs text-[#a8a8a8] transition-colors hover:border-[#262626] hover:text-[#e0e0e0] disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{label}
					</button>
				{/each}
			</div>

			{#if voiceHint}
				<p id="assistant-voice-hint" role="status" class="mb-2 text-[11px] text-[#8a8a8a]">{voiceHint}</p>
			{/if}

			<div
				class="flex items-end gap-2 rounded-xl transition-colors {dragOver
					? 'ring-2 ring-[var(--accent)]/60'
					: ''}"
				role="group"
				aria-label="Message composer — drop or paste an image to attach"
				ondrop={onDrop}
				ondragover={onDragOver}
				ondragleave={onDragLeave}
			>
				{#if ttsSupported}
					<button
						type="button"
						onclick={toggleTts}
						title={ttsEnabled ? 'Read replies aloud: on' : 'Read replies aloud: off'}
						aria-label={ttsEnabled ? 'Read replies aloud: on' : 'Read replies aloud: off'}
						aria-pressed={ttsEnabled}
						class="shrink-0 rounded-xl border px-3 py-3 text-sm transition-colors {ttsEnabled
							? 'border-[var(--accent)]/70 bg-[var(--accent)]/10 text-[var(--accent-hi)]'
							: 'border-[#262626] bg-[#141414] text-[#8a8a8a] hover:border-[#3a3a3a]'}"
					>
						<span aria-hidden="true">{ttsEnabled ? '🔊' : '🔈'}</span>
					</button>
				{/if}

				{#if micVisible}
					<button
						type="button"
						onclick={toggleMic}
						disabled={streaming}
						title={listening ? 'Stop dictation' : 'Dictate a message'}
						aria-label={listening ? 'Listening — stop dictation' : 'Dictate a message'}
						aria-pressed={listening}
						class="shrink-0 rounded-xl border px-3 py-3 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed {listening
							? 'border-rose-700 bg-rose-950/40 text-rose-300 animate-pulse'
							: 'border-[#262626] bg-[#141414] text-[#8a8a8a] hover:border-[#3a3a3a]'}"
					>
						<span aria-hidden="true">🎙</span>
					</button>
				{/if}

				<textarea
					bind:this={composerEl}
					bind:value={draft}
					onkeydown={onKeydown}
					onpaste={onPaste}
					disabled={streaming}
					rows="1"
					aria-label="Message the assistant"
					aria-describedby={voiceHint ? 'assistant-voice-hint' : undefined}
					placeholder="Message the assistant…  (Enter to send · Shift+Enter for newline)"
					class="flex-1 resize-none rounded-xl border border-[#262626] bg-[#111] px-4 py-3 text-sm text-[#e8e8e8] placeholder:text-[#5a5a5a] focus:outline-none focus:border-[#3a3a3a] disabled:opacity-50 min-h-[46px] max-h-40"
				></textarea>

				{#if streaming}
					<button
						type="button"
						onclick={stop}
						class="shrink-0 rounded-xl border border-[#262626] bg-[#141414] px-4 py-3 text-sm text-[#d6d6d6] transition-colors hover:border-[#3a3a3a]"
					>
						Stop
					</button>
				{:else}
					<button
						type="button"
						onclick={onSubmit}
						disabled={!draft.trim() && pendingImages.length === 0}
						class="shrink-0 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--accent-ink)] transition-colors hover:border-[var(--accent-hi)] hover:bg-[var(--accent-hi)] disabled:opacity-40 disabled:cursor-not-allowed"
					>
						Send
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
