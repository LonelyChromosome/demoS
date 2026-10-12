// Narrow page/host protocol. University data never crosses a remote server.
(() => {
  const scriptable = new URLSearchParams(location.search).has('scriptable');
  if (!scriptable) return;
  const queue = [];
  let wake = null, dirty = false;
  const notify = () => { if (wake) { const w=wake; wake=null;w(); } };
  window.addEventListener('bpa-platform-call',event => {
    try { queue.push(JSON.parse(event.detail));notify(); } catch (_) {}
  });
  const originalSet=Storage.prototype.setItem, originalRemove=Storage.prototype.removeItem, originalClear=Storage.prototype.clear;
  Storage.prototype.setItem=function(k,v){ originalSet.call(this,k,v); if(this===localStorage){dirty=true;notify();} };
  Storage.prototype.removeItem=function(k){ originalRemove.call(this,k);if(this===localStorage){dirty=true;notify();} };
  Storage.prototype.clear=function(){originalClear.call(this);if(this===localStorage){dirty=true;notify();} };
  window.bpaHost={
    init(preferences) {
      originalClear.call(localStorage);
      for (const [key,value] of Object.entries(preferences || {})) originalSet.call(localStorage,key,value);
      document.documentElement.dataset.bpaScriptable='ready';
      document.documentElement.dataset.betterPhenikaaBridge='ready';
      window.dispatchEvent(new CustomEvent('better-phenikaa-bridge-ready'));
      return window.bpaStart();
    },
    poll(done) {
      const finish=()=>{
        clearTimeout(timer); wake=null;
        const prefs=dirty?Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])):null;
        dirty=false;
        done({calls:queue.splice(0),preferences:prefs});
      };
      const timer=setTimeout(finish,750);
      if(queue.length||dirty) finish(); else wake=finish;
    },
    result(value) {window.dispatchEvent(new CustomEvent('bpa-platform-result',{detail:JSON.stringify(value)}));},
    event(channel,method,args) {window.dispatchEvent(new CustomEvent('bpa-native-event',{detail:JSON.stringify({channel,method,arguments:args})}));}
  };
})();
