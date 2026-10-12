{{flutter_js}}
{{flutter_build_config}}
async function startBPA() {
  await _flutter.loader.load({config:{renderer:'canvaskit',canvasKitBaseUrl:'canvaskit/'},onEntrypointLoaded:async initializer=>{
    const runner=await initializer.initializeEngine({renderer:'canvaskit',canvasKitBaseUrl:'canvaskit/'});
    await runner.runApp();
    if(window.__BPA_LOCAL__)window.dispatchEvent(new CustomEvent('bpa-platform-call',{detail:JSON.stringify({id:0,channel:'better_phenikaa/update',method:'runtimeReady',arguments:{}})}));
  }});
}
if (window.__BPA_LOCAL__ || new URLSearchParams(location.search).has('scriptable')) {
  window.bpaStart=startBPA;
} else { startBPA(); }
