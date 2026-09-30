const VOLUME_MARKUP = `
        <div class="volume-control" id="volume-control">
          <button id="btn-volume" class="ctrl-btn" type="button" aria-label="ปิดเสียง" aria-pressed="false" title="ปิดหรือเปิดเสียง">
            <svg id="icon-volume-on" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>
            <svg id="icon-volume-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>
          </button>
          <input id="volume-range" class="volume-range" type="range" min="0" max="100" value="100" aria-label="ระดับเสียง" />
        </div>
`;

const VOLUME_STYLE = `
<style id="volume-controls-style">
.volume-control { display:flex; align-items:center; gap:3px; flex:none; }
.volume-range { width:68px; height:22px; margin:0; accent-color:#FF5A3C; cursor:pointer; }
.volume-control .ctrl-btn:focus-visible, .volume-range:focus-visible { outline:2px solid #fff; outline-offset:2px; }
@media (max-width:480px) {
  .video-controls { gap:6px; padding:6px 8px; }
  .volume-control { position:relative; }
  .volume-range { display:none; position:absolute; right:-8px; bottom:33px; width:100px; height:36px; padding:7px; border-radius:8px; background:#111a2d; box-shadow:0 4px 12px rgba(0,0,0,.35); }
  .volume-control:hover .volume-range, .volume-control:focus-within .volume-range { display:block; }
}
</style>`;

const VOLUME_SCRIPT = `
<script id="volume-controls-script">
(function () {
  var video = document.getElementById("lesson-video");
  var button = document.getElementById("btn-volume");
  var range = document.getElementById("volume-range");
  var iconOn = document.getElementById("icon-volume-on");
  var iconOff = document.getElementById("icon-volume-off");
  if (!video || !button || !range) return;

  try {
    var savedVolume = Number(window.localStorage.getItem("interactedu-video-volume"));
    if (window.localStorage.getItem("interactedu-video-volume") !== null && isFinite(savedVolume)) {
      video.volume = Math.max(0, Math.min(1, savedVolume));
    }
    video.muted = window.localStorage.getItem("interactedu-video-muted") === "true";
  } catch (_) {}

  var lastAudibleVolume = video.volume > 0 ? video.volume : 1;
  function sync() {
    var silent = video.muted || video.volume === 0;
    range.value = String(Math.round(silent ? 0 : video.volume * 100));
    button.setAttribute("aria-label", silent ? "เปิดเสียง" : "ปิดเสียง");
    button.setAttribute("aria-pressed", String(silent));
    iconOn.style.display = silent ? "none" : "block";
    iconOff.style.display = silent ? "block" : "none";
    try {
      window.localStorage.setItem("interactedu-video-volume", String(video.volume));
      window.localStorage.setItem("interactedu-video-muted", String(video.muted));
    } catch (_) {}
  }

  button.addEventListener("click", function () {
    if (video.muted || video.volume === 0) {
      if (video.volume === 0) video.volume = lastAudibleVolume;
      video.muted = false;
    } else {
      lastAudibleVolume = video.volume;
      video.muted = true;
    }
    sync();
  });

  range.addEventListener("input", function () {
    video.volume = Number(range.value) / 100;
    video.muted = video.volume === 0;
    if (video.volume > 0) lastAudibleVolume = video.volume;
    sync();
  });
  video.addEventListener("volumechange", sync);
  sync();
})();
</script>`;

export function withVolumeControls(html: string): string {
  if (!html.includes('id="lesson-video"') || !html.includes('id="speed-select"') || html.includes('id="volume-control"')) {
    return html;
  }
  return html
    .replace('</head>', `${VOLUME_STYLE}\n</head>`)
    .replace('<select id="speed-select"', `${VOLUME_MARKUP}\n        <select id="speed-select"`)
    .replace('</body>', `${VOLUME_SCRIPT}\n</body>`);
}
