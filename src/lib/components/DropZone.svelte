<script lang="ts">
    let { accept = '*', multiple = true, onfiles, label = 'Drop files here', sublabel = 'or click to browse' }: Props = $props();
  type Props = {
        accept?: string;
        multiple?: boolean;
        onfiles: (files: File[]) => void;
        label?: string;
        sublabel?: string;
    }

    let dragging = $state(false);
    let inputEl: HTMLInputElement;

    function onDrop(e: DragEvent) {
        e.preventDefault();
        dragging = false;
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) onfiles(multiple ? files : [files[0]]);
    }

    function onDragOver(e: DragEvent) { e.preventDefault(); dragging = true; }
    function onDragLeave() { dragging = false; }

    function onInputChange(e: Event) {
        const files = Array.from((e.target as HTMLInputElement).files ?? []);
        if (files.length) onfiles(multiple ? files : [files[0]]);
        inputEl.value = '';
    }
</script>

<div
    class="dropzone {dragging ? 'dragging' : ''}"
    ondrop={onDrop}
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    onclick={() => inputEl.click()}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && inputEl.click()}
    aria-label="File drop zone — {label}">
    <input bind:this={inputEl} type="file" {accept} {multiple} onchange={onInputChange} class="hidden" />
    <div class="dropzone-content">
        <div class="dropzone-icon">⬆</div>
        <p class="dropzone-label">{label}</p>
        <p class="dropzone-sub">{sublabel}</p>
        <p class="dropzone-types">PDF · DOCX · CSV · Images</p>
    </div>
</div>

<style>
.dropzone {
    border: 2px dashed #2a2a2a;
    border-radius: 12px;
    padding: 32px;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
    text-align: center;
    background: #0d0d0d;
}
.dropzone:hover, .dropzone.dragging {
    border-color: #555;
    background: #111;
}
.dropzone.dragging { border-color: #fff; }
.dropzone-icon { font-size: 28px; margin-bottom: 8px; opacity: 0.5; }
.dropzone-label { font-size: 13px; color: #ccc; margin-bottom: 4px; }
.dropzone-sub { font-size: 11px; color: #555; margin-bottom: 6px; }
.dropzone-types { font-size: 10px; color: #333; letter-spacing: 1px; text-transform: uppercase; }
</style>
