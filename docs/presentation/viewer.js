(() => {
  const slide = document.querySelector(".slide");
  const frame = document.querySelector(".slide-frame");
  const stage = document.querySelector(".stage");
  const picker = document.getElementById("slide-picker");
  const fullscreen = document.getElementById("fullscreen");
  const error = document.getElementById("viewer-error");
  const resize = () => {
    const scale = Math.min((stage.clientWidth - 32) / 1600, (stage.clientHeight - 24) / 900);
    slide.style.transform = `scale(${Math.max(0.05, scale)})`;
    frame.style.width = `${1600 * Math.max(0.05, scale)}px`;
    frame.style.height = `${900 * Math.max(0.05, scale)}px`;
  };
  const navigate = (href) => {
    const url = new URL(href, location.href);
    const theme = new URLSearchParams(location.search).get("scoutTheme");
    if (theme) url.searchParams.set("scoutTheme", theme);
    location.href = url.href;
  };
  const present = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      error.hidden = true;
    } catch (failure) {
      error.textContent = `Fullscreen is unavailable: ${failure.message}. Browser zoom and slide navigation remain available.`;
      error.hidden = false;
    }
  };
  picker.addEventListener("change", () => navigate(picker.value));
  fullscreen.addEventListener("click", present);
  document.addEventListener("fullscreenchange", () => {
    fullscreen.textContent = document.fullscreenElement ? "Exit presentation" : "Present";
    resize();
  });
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input, select, textarea, button, summary, a") || event.ctrlKey || event.metaKey || event.altKey) return;
    const routes = {
      ArrowLeft: document.getElementById("previous")?.href,
      PageUp: document.getElementById("previous")?.href,
      ArrowRight: document.getElementById("next")?.href,
      PageDown: document.getElementById("next")?.href,
      Home: "slide-01.html",
      End: picker.options[picker.options.length - 1].value
    };
    if (routes[event.key]) {
      event.preventDefault();
      navigate(routes[event.key]);
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      present();
    }
  });
  new ResizeObserver(resize).observe(stage);
  resize();
})();
