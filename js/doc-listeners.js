// 본 창 문서(document)에 건 이벤트 듣기를 기록해 둔다(11-04 패널 분리).
// 패널을 별도 창으로 떼어 내면(js/panel-detach.js) 그 창 문서에도 같은 듣기를 걸어, 문서 전체에서 누름·입력을 받던 기능이 떼어 낸 창에서도 그대로 돈다.
// 다른 스크립트보다 먼저 읽혀야 하므로 index.html 머리에서 일반 스크립트로 읽는다.
(function () {
  if (window.__fiveEDocListeners) return;
  var list = [], add = document.addEventListener, remove = document.removeEventListener;
  window.__fiveEDocListeners = list;
  window.__fiveEPanelDocs = window.__fiveEPanelDocs || [];
  document.addEventListener = function (type, fn, opts) {
    list.push([type, fn, opts]);
    for (var i = 0; i < window.__fiveEPanelDocs.length; i++) { try { window.__fiveEPanelDocs[i].addEventListener(type, fn, opts); } catch (e) {} }
    return add.call(this, type, fn, opts);
  };
  document.removeEventListener = function (type, fn, opts) {
    for (var i = list.length - 1; i >= 0; i--) if (list[i][0] === type && list[i][1] === fn) list.splice(i, 1);
    for (var j = 0; j < window.__fiveEPanelDocs.length; j++) { try { window.__fiveEPanelDocs[j].removeEventListener(type, fn, opts); } catch (e) {} }
    return remove.call(this, type, fn, opts);
  };
})();
