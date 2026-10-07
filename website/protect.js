['copy','cut','contextmenu','dragstart','selectstart'].forEach(function(e){
  document.addEventListener(e,function(ev){ev.preventDefault()});
});
