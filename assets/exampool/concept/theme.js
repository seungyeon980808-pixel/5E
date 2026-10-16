// Presentation only: changing the theme or design variant never reloads or replaces question data.
(() => {
  const root=document.documentElement;
  const params=new URLSearchParams(location.search);
  const skins=['a','b','c'];
  root.dataset.theme=params.get('theme')==='light'?'light':'dark';
  root.dataset.skin=skins.includes(params.get('skin'))?params.get('skin'):'a';
  document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('theme-select').value=root.dataset.theme;
    const skin=document.getElementById('skin-select');if(skin)skin.value=root.dataset.skin;
  });
  document.addEventListener('change',e=>{
    const url=new URL(location.href);
    if(e.target.id==='theme-select'){
      root.dataset.theme=e.target.value==='light'?'light':'dark';
      url.searchParams.set('theme',root.dataset.theme);
    }else if(e.target.id==='skin-select'){
      root.dataset.skin=skins.includes(e.target.value)?e.target.value:'a';
      url.searchParams.set('skin',root.dataset.skin);
    }else return;
    history.replaceState(null,'',url);
  });
})();
