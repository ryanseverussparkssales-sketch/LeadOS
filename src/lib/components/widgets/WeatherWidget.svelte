<script lang="ts">
    import { onMount } from 'svelte';

    interface Weather {
        temp: number; condition: string; icon: string; location: string;
        high: number; low: number;
    }

    let weather = $state<Weather | null>(null);
    let loading = $state(true);

    const WMO_CODES: Record<number, {label: string; icon: string}> = {
        0: { label: 'Clear', icon: '☀️' }, 1: { label: 'Mostly clear', icon: '🌤' },
        2: { label: 'Partly cloudy', icon: '⛅' }, 3: { label: 'Cloudy', icon: '☁️' },
        45: { label: 'Foggy', icon: '🌫' }, 48: { label: 'Icy fog', icon: '🌫' },
        51: { label: 'Light drizzle', icon: '🌦' }, 61: { label: 'Light rain', icon: '🌧' },
        63: { label: 'Rain', icon: '🌧' }, 65: { label: 'Heavy rain', icon: '⛈' },
        71: { label: 'Light snow', icon: '🌨' }, 73: { label: 'Snow', icon: '❄️' },
        80: { label: 'Showers', icon: '🌦' }, 95: { label: 'Thunderstorm', icon: '⛈' },
    };

    onMount(async () => {
        try {
            const pos = await new Promise<GeolocationPosition>((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
            const { latitude: lat, longitude: lon } = pos.coords;

            const [weatherRes, geoRes] = await Promise.all([
                fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`),
                fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
            ]);

            if (weatherRes.ok) {
                const data = await weatherRes.json();
                const code = data.current?.weathercode ?? 0;
                const codeInfo = WMO_CODES[code] ?? { label: 'Unknown', icon: '🌡' };
                const geo = geoRes.ok ? await geoRes.json() : null;
                const city = geo?.address?.city ?? geo?.address?.town ?? geo?.address?.village ?? 'Your Area';

                weather = {
                    temp: Math.round(data.current?.temperature_2m ?? 0),
                    condition: codeInfo.label,
                    icon: codeInfo.icon,
                    location: city,
                    high: Math.round(data.daily?.temperature_2m_max?.[0] ?? 0),
                    low: Math.round(data.daily?.temperature_2m_min?.[0] ?? 0),
                };
            }
        } catch { weather = null; }
        loading = false;
    });
</script>

<div class="flex flex-col h-full p-4 justify-between">
    {#if loading}
        <div class="flex-1 flex items-center justify-center">
            <div class="w-6 h-6 rounded-full bg-[#1a1a1a] animate-pulse"></div>
        </div>
    {:else if weather}
        <div>
            <p class=" text-[#444]  mb-1" style="font-family:var(--font-label);font-size:9px;letter-spacing:.2em;text-transform:uppercase">{weather.location}</p>
            <div class="flex items-center gap-3">
                <span style="font-size: 2.5rem; line-height: 1">{weather.icon}</span>
                <div>
                    <p class="text-3xl text-white font-bold font-mono">{weather.temp}°</p>
                    <p class="text-xs text-[#666]">{weather.condition}</p>
                </div>
            </div>
        </div>
        <p class="text-xs text-[#444]">H:{weather.high}° L:{weather.low}°</p>
    {:else}
        <p class="text-xs text-[#333] text-center mt-4">Enable location to see weather</p>
    {/if}
</div>
