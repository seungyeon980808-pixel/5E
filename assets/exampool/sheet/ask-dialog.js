// 11-12: 5E_exam 안에 남아 있던 맥 기본 확인창(window.confirm)을 「문항 삭제」 창과 같은 5E 창으로 바꾼다.
// ask(message,{title,ok,cancel,doc}) → Promise<boolean>. Esc·닫기·취소는 false.
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function ask(message,{title='확인',ok='예',cancel='취소',doc=document}={}){
  return new Promise(resolve=>{
    const dialog=doc.createElement('dialog');dialog.className='ask-dialog';
    dialog.innerHTML=`<div class="dialog-head"><h2>${E(title)}</h2><button type="button" data-ask="no">닫기</button></div><p class="ask-message">${E(message)}</p><div class="dialog-actions"><button type="button" data-ask="no">${E(cancel)}</button><button type="button" data-ask="yes" class="ask-ok">${E(ok)}</button></div>`;
    let answer=false;
    dialog.addEventListener('click',e=>{const b=e.target.closest('[data-ask]');if(!b)return;answer=b.dataset.ask==='yes';dialog.close();});
    dialog.addEventListener('close',()=>{dialog.remove();resolve(answer);},{once:true});
    doc.body.append(dialog);dialog.showModal();dialog.querySelector('.ask-ok').focus();
  });
}
