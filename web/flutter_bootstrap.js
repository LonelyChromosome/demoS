{{flutter_js}}
{{flutter_build_config}}
async function startBPA() {
  await _flutter.loader.load({config:{renderer:'canvaskit',canvasKitBaseUrl:'canvaskit/'}});
}
if (window.__BPA_LOCAL__ || new URLSearchParams(location.search).has('scriptable')) {
  window.bpaStart=startBPA;
} else { startBPA(); }
