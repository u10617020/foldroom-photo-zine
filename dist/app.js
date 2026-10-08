'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const W = 891, H = 630, PW = W / 4, PH = H / 2, MM = 3, PT = 25.4 / 72 * MM;
  const PAGE_ORDER = [5, 4, 3, 2, 6, 7, 8, 1];
  const SPREADS = [[1], [2, 3], [4, 5], [6, 7], [8]];
  const fonts = { sans: '"Microsoft JhengHei", "PingFang TC", sans-serif', serif: '"PMingLiU", "Songti TC", serif', notoSans:'"Zine Noto Sans TC", sans-serif', notoSerif:'"Zine Noto Serif TC", serif', wenkai:'"Zine WenKai TC", serif' };
  const fontWeights = {sans:[400,700],serif:[400,700],notoSans:[100,200,300,400,500,600,700,800,900],notoSerif:[200,300,400,500,600,700,800,900],wenkai:[300,400,700]};
  const weightLabels = {100:'極細',200:'特細',300:'細體',400:'標準',500:'中等',600:'半粗',700:'粗體',800:'特粗',900:'超粗'};
  const fontLoads = new Map();
  const fontKey = o => `${o.font}-${o.fontWeight || 400}`;
  function loadFont(o) {
    if (!['notoSans','notoSerif','wenkai'].includes(o.font)) return Promise.resolve();
    const key=fontKey(o); if(fontLoads.has(key))return fontLoads.get(key).promise;
    const entry={status:'loading',promise:null};fontLoads.set(key,entry);
    entry.promise=document.fonts.load(`${o.fontWeight||400} 24px ${fonts[o.font].split(',')[0]}`,'攝影小誌').then(faces=>{if(!faces.length)throw new Error('Font unavailable');entry.status='loaded';}).catch(()=>{entry.status='failed';throw new Error('字體載入失敗，請切換字體後重試。');});
    return entry.promise;
  }
  const assets = new Map();
  let objects = [], selected = null, nextId = 1, nextAsset = 1, style = 'margin';
  let history = ['[]'], historySelection = [null], historyIndex = 0, dirty = false, view = 'edit', spread = 0, replacing = false, importing = false;
  let toastTimer, scale = 1;
  if (!window.Konva || !window.jspdf) { $('selectionTitle').textContent = '編輯器載入失敗，請重新整理'; return; }
  Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const stage = new Konva.Stage({container: 'stage', width: W, height: H});
  const contentLayer = new Konva.Layer();
  const guideLayer = new Konva.Layer({listening: false});
  const controlLayer = new Konva.Layer();
  stage.add(contentLayer, guideLayer, controlLayer);
  const transformer = new Konva.Transformer({rotateEnabled: true, rotateAnchorOffset: -20, flipEnabled: false, keepRatio: false, ignoreStroke: true, borderStroke: '#597b63', anchorStroke: '#597b63', anchorFill: '#fff', anchorSize: 8, anchorCornerRadius: 8, padding: 2, rotationSnaps: [0, 90, 180, 270], boundBoxFunc: (oldBox, box) => Math.abs(box.width) < 9 || Math.abs(box.height) < 9 ? oldBox : box});
  controlLayer.add(transformer);
  const snapLayer = new Konva.Group({listening: false});
  controlLayer.add(snapLayer);
  const selectedObject = () => objects.find(o => o.id === selected);
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500); }
  function panel(page) { const i = PAGE_ORDER.indexOf(Number(page)); return { x: (i % 4) * PW, y: Math.floor(i / 4) * PH, rotation: i < 4 ? 180 : 0 }; }
  function commit() { const json = JSON.stringify(objects); if (history[historyIndex] !== json) { history = history.slice(0, historyIndex + 1); historySelection = historySelection.slice(0, historyIndex + 1); history.push(json); historySelection.push(selected); if (history.length > 80) { history.shift(); historySelection.shift(); } historyIndex = history.length - 1; dirty = true; } updateHistory(); }
  function updateHistory() { $('undoBtn').disabled = historyIndex === 0; $('redoBtn').disabled = historyIndex >= history.length - 1; }
  function moveHistory(delta) { commit(); const i = historyIndex + delta; if (i < 0 || i >= history.length) return; historyIndex = i; objects = JSON.parse(history[i]); selected = historySelection[i]; dirty = true; render(); }
  function makeObject(type, extra = {}) { const p = panel($('targetPage').value); return { id: nextId++, type, x: p.x + PW / 2, y: p.y + PH / 2, w: type === 'mount' ? 54*MM : PW-30, h: type === 'mount' ? 86*MM : type === 'text' ? 70 : PH-40, rotation: p.rotation, ...(type === 'text' ? { text: '寫下這一刻', font: 'sans', fontWeight:400, fontSize: 16, color: '#293b32', align: 'center', verticalAlign: 'middle' } : type === 'mount' ? {mountMode:$('mountDefaultMode').value} : { assetId: null, fit: style === 'full' ? 'cover' : 'contain', cropZoom: 1, cropX: 0, cropY: 0 }), ...extra }; }
  function drawMount(group, o, interactive) {
    const width=o.w,height=o.h;
    group.add(new Konva.Rect({width,height,fill:'#fff',stroke:o.mountMode==='slits'?'#b6bdb0':'#899a86',strokeWidth:.7,dash:[3,3],listening:false}));
    if(o.mountMode==='slits') {
      for(const distance of [4*MM,7*MM]) {
        const d=Math.min(distance,Math.min(width,height)*.32);
        for(const points of [[d,0,0,d],[width-d,0,width,d],[0,height-d,d,height],[width-d,height,width,height-d]])
          group.add(new Konva.Line({points,stroke:'#ae674d',strokeWidth:.8,lineCap:'round',listening:false}));
      }
    }
    if(interactive)group.add(new Konva.Text({x:5,y:height/2-16,width:width-10,text:`實體相片位置\n${Math.round(width/MM)} × ${Math.round(height/MM)} mm`,fontSize:10,align:'center',lineHeight:1.5,fontFamily:fonts.sans,fill:'#8a9685',listening:false}));
  }
  function imageGeometry(o, a) { const source = o.cropRect || {width:a.width,height:a.height}; const base = (o.fit === 'cover' ? Math.max : Math.min)(o.w / source.width, o.h / source.height); const factor = base * o.cropZoom; const w = source.width * factor, h = source.height * factor; return { x: (o.w - w) / 2 + o.cropX * Math.abs(o.w - w) / 2, y: (o.h - h) / 2 + o.cropY * Math.abs(o.h - h) / 2, width: w, height: h, factor }; }
  function makeNode(o, interactive) {
    if(interactive && o.type==='text' && ['notoSans','notoSerif','wenkai'].includes(o.font) && !fontLoads.has(fontKey(o))) loadFont(o).then(()=>render()).catch(error=>{updateInspector();toast(error.message);});
    const group = new Konva.Group({id: String(o.id), x: o.x, y: o.y, width: o.w, height: o.h, offsetX: o.w / 2, offsetY: o.h / 2, rotation: o.rotation, draggable: interactive, clipX: 0, clipY: 0, clipWidth: o.w, clipHeight: o.h});
    // Explicit group bounds keep handles on the frame, including clipped photos and wrapped text.
    group.getClientRect = function(config = {}) { const rect = {x: 0, y: 0, width: o.w, height: o.h}; return config.skipTransform ? rect : this._transformedRect(rect, config.relativeTo); };
    group.add(new Konva.Rect({width: o.w, height: o.h, fill: o.type === 'photo' ? '#fff' : 'rgba(255,255,255,0)'}));
    if (o.type === 'photo') {
      const a = assets.get(o.assetId);
      if (a) group.add(new Konva.Image({image: a.image, crop: o.cropRect || {x:0,y:0,width:a.width,height:a.height}, ...imageGeometry(o, a), listening: false}));
      else if (interactive) {
        group.add(new Konva.Rect({x: 1, y: 1, width: o.w - 2, height: o.h - 2, stroke: '#c0cbbb', dash: [5, 4], fill: '#f4f6ef', listening: false}));
        group.add(new Konva.Text({x: 5, y: Math.max(2, o.h / 2 - 20), width: o.w - 10, text: '＋\n點兩下加入照片', fontSize: 11, lineHeight: 1.7, align: 'center', fill: '#85947b', fontFamily: fonts.sans, listening: false}));
      }
    } else if(o.type==='mount')drawMount(group,o,interactive);
    else group.add(new Konva.Text({name: 'copy', width: o.w, height: o.h, text: o.text, fontFamily: fonts[o.font], fontStyle:String(o.fontWeight||400), fontSize: o.fontSize * PT, fill: o.color, align: o.align, verticalAlign:o.verticalAlign||'top', lineHeight: 1.45, wrap: 'char', padding: 0, listening: false}));
    if (interactive) {
      group.on('click tap', e => { e.cancelBubble = true; select(o.id); });
      group.on('dblclick dbltap', e => { e.cancelBubble = true; select(o.id); if (o.type === 'photo') { if (o.assetId) openCrop(); else { replacing = true; $('fileInput').click(); } } else if(o.type==='text') { $('textValue').focus(); $('textValue').select(); } });
      group.on('dragstart', () => select(o.id));
      group.on('dragmove', () => snap(group, o));
      group.on('dragend', () => { o.x = group.x(); o.y = group.y(); snapLayer.destroyChildren(); commit(); render(); });
      group.on('transformend', () => { o.x = group.x(); o.y = group.y(); o.w = Math.max(3, o.w * group.scaleX()); o.h = Math.max(3, o.h * group.scaleY()); o.rotation = group.rotation(); snapLayer.destroyChildren(); commit(); render(); });
      group.on('mouseenter', () => stage.container().style.cursor = 'move');
      group.on('mouseleave', () => stage.container().style.cursor = 'default');
    }
    return group;
  }
  function snap(node, o) {
    snapLayer.destroyChildren();
    const half = (item, axis) => { const r = item.rotation * Math.PI / 180; return axis === 'x' ? (Math.abs(Math.cos(r)) * item.w + Math.abs(Math.sin(r)) * item.h) / 2 : (Math.abs(Math.sin(r)) * item.w + Math.abs(Math.cos(r)) * item.h) / 2; };
    for (const axis of ['x', 'y']) {
      const at = node[axis](), candidates = [];
      if (o.type === 'photo') {
        const size = half(o, axis), edges = [at - size, at, at + size];
        const sheetLines = axis === 'x' ? [0, PW, PW * 2, PW * 3, W] : [0, PH, H];
        const pageCenters = axis === 'x' ? [PW / 2, PW * 1.5, PW * 2.5, PW * 3.5] : [PH / 2, PH * 1.5];
        [...sheetLines, ...pageCenters].forEach(target => candidates.push({delta: target - at, target}));
        objects.filter(other => other.id !== o.id && other.type === 'photo').forEach(other => {
          const h = half(other, axis), targets = [other[axis] - h, other[axis], other[axis] + h];
          for (const [from, to] of [[0, 0], [1, 1], [2, 2], [0, 2], [2, 0]]) candidates.push({delta: targets[to] - edges[from], target: targets[to]});
        });
      } else {
        const targets = axis === 'x' ? [0, PW, PW * 2, PW * 3, W] : [0, PH, H];
        objects.filter(other => other.id !== o.id).forEach(other => targets.push(other[axis]));
        targets.forEach(target => candidates.push({delta: target - at, target}));
      }
      const nearest = candidates.reduce((best, candidate) => Math.abs(candidate.delta) < Math.abs(best.delta) ? candidate : best);
      if (Math.abs(nearest.delta) < 5 / scale) {
        node[axis](at + nearest.delta);
        snapLayer.add(new Konva.Line({points: axis === 'x' ? [nearest.target, 0, nearest.target, H] : [0, nearest.target, W, nearest.target], stroke: '#b9774b', strokeWidth: 1 / scale, dash: [4, 4]}));
      }
    }
  }
  function drawGuides(layer, labels = true) {
    for (let i = 1; i < 4; i++) layer.add(new Konva.Line({points: [PW * i, 0, PW * i, H], stroke: '#81917c', opacity: .6, strokeWidth: .65, dash: [5, 5]}));
    layer.add(new Konva.Line({points: [0, PH, W, PH], stroke: '#81917c', opacity: .6, strokeWidth: .65, dash: [5, 5]}));
    layer.add(new Konva.Line({points: [PW, PH, PW * 3, PH], stroke: '#bc6c4b', strokeWidth: 1.2}));
    if (labels) PAGE_ORDER.forEach(page => { const p = panel(page); const g = new Konva.Group({x: p.x + PW / 2, y: p.y + PH / 2, rotation: p.rotation}); const text = `${page === 1 ? '01 封面' : page === 8 ? '08 封底' : `0${page}`}  ↑`; g.add(new Konva.Rect({x: -PW / 2 + 7, y: -PH / 2 + 7, width: 69, height: 20, fill: '#f6f8f2', opacity: .92, cornerRadius: 3})); g.add(new Konva.Text({x: -PW / 2 + 14, y: -PH / 2 + 12, text, fontSize: 10, fill: '#728267', fontFamily: fonts.sans})); layer.add(g); });
  }
  function render() {
    transformer.nodes([]); contentLayer.destroyChildren(); guideLayer.destroyChildren();
    contentLayer.add(new Konva.Rect({width: W, height: H, fill: '#fff', name: 'paper'}));
    objects.forEach(o => contentLayer.add(makeNode(o, true)));
    if ($('showGuides').checked) drawGuides(guideLayer);
    if (!objects.length) {
      const p = panel($('targetPage').value);
      guideLayer.add(new Konva.Rect({x: p.x + 12, y: p.y + 35, width: PW - 24, height: PH - 55, fill: '#f4f6ef', cornerRadius: 3}));
      guideLayer.add(new Konva.Text({x: p.x + 18, y: p.y + PH / 2 - 24, width: PW - 36, text: '從這一頁開始\n加入照片，或選一個版型', align: 'center', lineHeight: 2, fontSize: 12, fontFamily: fonts.sans, fill: '#9aa68f'}));
    }
    select(selected); updateHistory(); $('statusCount').textContent = `${objects.length} 個物件 · ${objects.filter(o => o.type === 'photo' && o.assetId).length} 張照片 · ${objects.filter(o => o.type === 'mount').length} 個實體相片位置`;
    if (view === 'preview') renderBook();
    stage.batchDraw();
  }
  function select(id) { selected = objects.some(o => o.id === id) ? id : null; const node = selected ? contentLayer.findOne('#' + selected) : null; transformer.nodes(node ? [node] : []); updateInspector(); }
  function setValue(id, value) { if (document.activeElement !== $(id)) $(id).value = value; }
  function updateInspector() {
    const o = selectedObject(); $('noSelection').hidden = !!o; $('selectionPanel').hidden = !o; $('selectionTitle').textContent = o ? o.type === 'text' ? '寫下你的觀看' : o.type === 'mount' ? '安排實體相片位置' : '調整這一個片刻' : '給每一頁一點個性';
    if (!o) return;
    $('textControls').hidden = o.type !== 'text'; $('photoControls').hidden = o.type !== 'photo'; $('mountControls').hidden=o.type!=='mount'; $('cropPhotoBtn').disabled = !assets.has(o.assetId);
    $('dimensions').textContent=`目前 ${Math.round(o.w/MM*10)/10} × ${Math.round(o.h/MM*10)/10} mm · 拖動物件、拉邊角改尺寸，上方圓點可旋轉`;
    if(o.type==='mount'){setValue('mountMode',o.mountMode);$('mountSizeNote').textContent=Math.abs(o.w/MM-54)<.3&&Math.abs(o.h/MM-86)<.3?'符合拍立得 mini 54 × 86 mm':'目前尺寸不是拍立得 mini；若要放 mini 實體相片，請按「回到 mini 尺寸」。';}
    if (o.type === 'text') {
      const weightSelect=$('fontWeight');
      if(weightSelect.dataset.family!==o.font){weightSelect.replaceChildren(...fontWeights[o.font].map(weight=>new Option(`${weightLabels[weight]} · ${weight}`,String(weight))));weightSelect.dataset.family=o.font;}
      [['textValue',o.text],['fontFamily',o.font],['fontWeight',o.fontWeight||400],['fontSize',o.fontSize],['textColor',o.color],['textAlign',o.align],['verticalAlign',o.verticalAlign||'top']].forEach(([id,v]) => setValue(id,v));
      const status=fontLoads.get(fontKey(o))?.status;
      $('fontStatus').textContent=status==='loading'?'正在載入字體，完成後會更新畫面…':status==='failed'?'字體載入失敗，請切換字體後重試。':'';
    }
    else if (o.type === 'photo') [['cropZoom',o.cropZoom],['cropX',o.cropX],['cropY',o.cropY]].forEach(([id,v]) => setValue(id,v));
    const warnings = [];
    if (o.type === 'photo' && assets.has(o.assetId)) { const dpi = MM * 25.4 / imageGeometry(o, assets.get(o.assetId)).factor; if (dpi < 180) warnings.push(`照片約 ${Math.round(dpi)} dpi，列印可能較模糊；可縮小相框或換較大的照片。`); }
    if (o.type === 'text') { const t = new Konva.Text({text: o.text, width: o.w, fontFamily: fonts[o.font], fontStyle:String(o.fontWeight||400), fontSize: o.fontSize * PT, lineHeight: 1.45, wrap: 'char'}); if (t.height() > o.h + 1) warnings.push('文字超出框高，請加高文字框或縮小字級，以免輸出被裁切。'); t.destroy(); }
    if(o.type==='mount'){const box={x:o.x,y:o.y,w:o.w,h:o.h,rotation:o.rotation};const page=PAGE_ORDER.find(n=>{const p=panel(n),r=box.rotation*Math.PI/180,halfW=(Math.abs(Math.cos(r))*box.w+Math.abs(Math.sin(r))*box.h)/2,halfH=(Math.abs(Math.sin(r))*box.w+Math.abs(Math.cos(r))*box.h)/2;return box.x-halfW>p.x+1&&box.x+halfW<p.x+PW-1&&box.y-halfH>p.y+1&&box.y+halfH<p.y+PH-1;});if(!page)warnings.push('定位框碰到摺線或紙張邊緣；請往頁面內拖，避免割線落在摺線上。');}
    $('objectWarning').textContent = warnings.join(' ');
  }
  function resize() { if (view !== 'edit') return; const avail = $('canvasViewport').clientWidth - 20; scale = $('zoom').value === 'fit' ? Math.min(1.3, Math.max(.16, avail / W)) : Number($('zoom').value); stage.width(W * scale); stage.height(H * scale); stage.scale({x: scale, y: scale}); $('paperWrap').style.width = `${W * scale}px`; $('paperWrap').style.height = `${H * scale}px`; stage.batchDraw(); }
  function renderSheet(ratio = 1, guides = false) {
    const container = document.createElement('div');
    const output = new Konva.Stage({container, width: W, height: H}); const layer = new Konva.Layer(); output.add(layer); layer.add(new Konva.Rect({width: W, height: H, fill: '#fff'})); objects.forEach(o => layer.add(makeNode(o, false))); if (guides) drawGuides(layer, false); layer.draw(); const canvas = output.toCanvas({pixelRatio: ratio}); output.destroy(); return canvas;
  }
  function renderBook() {
    const sheet = renderSheet(1.5); $('bookPages').replaceChildren();
    for (const page of SPREADS[spread]) { const p = panel(page); const c = document.createElement('canvas'); c.width = 446; c.height = 630; c.setAttribute('aria-label', `第 ${page} 頁成冊預覽`); const ctx = c.getContext('2d'); ctx.translate(c.width / 2, c.height / 2); ctx.rotate(p.rotation * Math.PI / 180); ctx.drawImage(sheet, p.x * 1.5, p.y * 1.5, PW * 1.5, PH * 1.5, -c.width / 2, -c.height / 2, c.width, c.height); $('bookPages').append(c); }
    $('spreadLabel').textContent = spread === 0 ? '01 / 封面' : spread === 4 ? '08 / 封底' : `第 ${SPREADS[spread][0]} — ${SPREADS[spread][1]} 頁`;
    $('prevSpread').disabled = spread === 0; $('nextSpread').disabled = spread === 4;
  }
  function setView(next) { commit(); view = next; $('canvasViewport').hidden = view !== 'edit'; $('bookView').hidden = view === 'edit'; $('editTab').classList.toggle('active', view === 'edit'); $('previewTab').classList.toggle('active', view === 'preview'); $('viewLabel').textContent = view === 'edit' ? 'PRINT SHEET / 列印拼版' : 'READING VIEW / 成冊順序'; $('zoom').disabled = view !== 'edit'; if (view === 'preview') renderBook(); else resize(); }
  function addText() { commit(); const o = makeObject('text'); objects.push(o); selected = o.id; commit(); render(); if (view === 'edit') $('textValue').focus(); }
  function addMount() { commit(); const o=makeObject('mount');objects.push(o);selected=o.id;commit();render();toast('已加入 54 × 86 mm 定位框，拖曳移動、拉邊角調整'); }
  function addMountAll() {commit();let count=0;for(let page=1;page<=8;page++){const p=panel(page);if(objects.some(o=>o.type==='mount'&&o.x>=p.x&&o.x<p.x+PW&&o.y>=p.y&&o.y<p.y+PH))continue;const o=makeObject('mount',{x:p.x+PW/2,y:p.y+PH/2,rotation:p.rotation});objects.push(o);selected=o.id;count++;}if(count){commit();render();}toast(count?`已加入 ${count} 個拍立得 mini 定位框`:'每頁都有實體相片位置了');}
  function addPhoto(assetId) { const current = selectedObject(); if (current?.type === 'photo' && !current.assetId) { current.assetId = assetId; } else { const o = makeObject('photo', {assetId}); objects.push(o); selected = o.id; } commit(); render(); }
  function refreshAssets() { $('assets').replaceChildren(); for (const a of assets.values()) { const b = document.createElement('button'); b.className = 'asset'; b.title = `加入 ${a.name}`; b.setAttribute('aria-label', `加入照片 ${a.name}`); const img = document.createElement('img'); img.src = a.url; img.alt = a.name; b.append(img); b.onclick = () => addPhoto(a.id); $('assets').append(b); } $('assetCount').textContent = `${assets.size} 張`; }
  async function importFiles(files, replaceId = null) {
    if (importing) return toast('正在讀取照片，請稍候'); importing = true; $('uploadBtn').disabled = true; let added = 0, failed = 0;
    try { for (const file of files) {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) { failed++; continue; }
      const url = URL.createObjectURL(file);
      try { const img = new Image(); img.src = url; await img.decode(); const id = nextAsset++; assets.set(id, {id, url, image: img, width: img.naturalWidth, height: img.naturalHeight, name: file.name});
        const target = added === 0 ? objects.find(o => o.id === replaceId && o.type === 'photo') || (selectedObject()?.type === 'photo' && !selectedObject().assetId ? selectedObject() : null) : null;
        if (target) { Object.assign(target,{assetId:id,cropRect:null,cropZoom:1,cropX:0,cropY:0}); selected = target.id; }
        else { const o = makeObject('photo', {assetId:id}); o.x += (added % 4) * 10; o.y += (added % 4) * 10; objects.push(o); selected = o.id; } added++;
      } catch { URL.revokeObjectURL(url); failed++; }
    } if (added) { commit(); refreshAssets(); render(); } toast(`已加入 ${added} 張照片${failed ? `，${failed} 個檔案無法讀取（支援 JPG、PNG、WebP）` : '，可拖拉調整或跨頁排版'}`);
    } finally { importing = false; $('uploadBtn').disabled = false; }
  }
  function objectIntersects(o, p) { const r = o.rotation * Math.PI / 180; const hw = (Math.abs(Math.cos(r))*o.w+Math.abs(Math.sin(r))*o.h)/2; const hh = (Math.abs(Math.sin(r))*o.w+Math.abs(Math.cos(r))*o.h)/2; return o.x+hw > p.x+.1 && o.x-hw < p.x+PW-.1 && o.y+hh > p.y+.1 && o.y-hh < p.y+PH-.1; }
  function applyTemplate(kind) {
    commit(); const page = Number($('targetPage').value), p = panel(page); const impacted = objects.filter(o => objectIntersects(o,p));
    if (impacted.length && !window.confirm(`第 ${page} 頁有 ${impacted.length} 個物件。套版會移除與本頁重疊的物件（跨頁物件也會整個移除），確定取代？可使用復原還原。`)) return;
    const removed = new Set(impacted.map(o => o.id)); objects = objects.filter(o => !removed.has(o.id));
    const m = style === 'margin' ? 15 : 0, gap = style === 'margin' ? 8 : 0, w = PW - m*2, h = PH-m*2;
    const cells = kind === 'double' ? [[m,m,w,(h-gap)/2],[m,m+(h+gap)/2,w,(h-gap)/2]] : kind === 'grid' ? [[m,m,(w-gap)/2,(h-gap)/2],[m+(w+gap)/2,m,(w-gap)/2,(h-gap)/2],[m,m+(h+gap)/2,(w-gap)/2,(h-gap)/2],[m+(w+gap)/2,m+(h+gap)/2,(w-gap)/2,(h-gap)/2]] : kind === 'story' ? [[m,m,w,h*.68]] : [[m,m,w,h]];
    const place = (type,x,y,cw,ch) => { const localX = x+cw/2, localY = y+ch/2; const o = makeObject(type,{x:p.x+(p.rotation ? PW-localX : localX),y:p.y+(p.rotation ? PH-localY : localY),w:cw,h:ch,rotation:p.rotation}); objects.push(o); return o; };
    cells.forEach(c => place('photo',...c)); if (kind === 'story') place('text',Math.max(m,12),m+h*.73,w-(m ? 0:24),h*.22);
    selected = objects[objects.length-cells.length-(kind==='story'?1:0)].id; commit(); render(); toast(`已套用到第 ${page} 頁，點兩下相框加入照片`);
  }
  let cropStage = null, cropSession = null;
  function openCrop() {
    const o = selectedObject(), a = assets.get(o?.assetId); if (!a) return;
    commit(); $('cropDialog').showModal(); $('cropResizeFrame').checked = true;
    const pad = 22, available = Math.max(120, $('cropCanvas').clientWidth - pad*2);
    const ratio = Math.min(available/a.width, Math.max(140,window.innerHeight*.49)/a.height, 1);
    const iw = a.width*ratio, ih = a.height*ratio;
    cropStage = new Konva.Stage({container:'cropCanvas',width:iw+pad*2,height:ih+pad*2});
    const layer = new Konva.Layer(); cropStage.add(layer);
    layer.add(new Konva.Image({image:a.image,x:pad,y:pad,width:iw,height:ih,listening:false}));
    layer.add(new Konva.Rect({x:pad,y:pad,width:iw,height:ih,fill:'rgba(18,28,23,.62)',listening:false}));
    const reveal = new Konva.Image({image:a.image,listening:false}); layer.add(reveal);
    const initial = o.cropRect || {x:0,y:0,width:a.width,height:a.height};
    const rect = new Konva.Rect({x:pad+initial.x*ratio,y:pad+initial.y*ratio,width:initial.width*ratio,height:initial.height*ratio,fill:'rgba(255,255,255,0)',stroke:'#fff',strokeWidth:1,draggable:true}); layer.add(rect);
    const lines = new Konva.Group({listening:false}); layer.add(lines);
    const handles = new Konva.Transformer({nodes:[rect],rotateEnabled:false,flipEnabled:false,keepRatio:false,ignoreStroke:true,anchorSize:11,anchorStroke:'#3b5148',anchorFill:'#fff',borderStroke:'#fff',boundBoxFunc(old,box){return box.width<Math.min(12,iw)||box.height<Math.min(12,ih)||box.x<pad-.1||box.y<pad-.1||box.x+box.width>pad+iw+.1||box.y+box.height>pad+ih+.1?old:box;}});layer.add(handles);
    const bounds = () => ({x:rect.x(),y:rect.y(),width:rect.width()*rect.scaleX(),height:rect.height()*rect.scaleY()});
    function update() {
      const b=bounds(); const x=Math.max(0,Math.round((b.x-pad)/ratio)),y=Math.max(0,Math.round((b.y-pad)/ratio));
      cropSession.region={x,y,width:Math.max(1,Math.min(a.width-x,Math.round(b.width/ratio))),height:Math.max(1,Math.min(a.height-y,Math.round(b.height/ratio)))};
      reveal.setAttrs({...b,crop:cropSession.region}); lines.destroyChildren();
      for(let i=1;i<3;i++){lines.add(new Konva.Line({points:[b.x+b.width*i/3,b.y,b.x+b.width*i/3,b.y+b.height],stroke:'#fff',opacity:.55,strokeWidth:1}));lines.add(new Konva.Line({points:[b.x,b.y+b.height*i/3,b.x+b.width,b.y+b.height*i/3],stroke:'#fff',opacity:.55,strokeWidth:1}));}
      $('cropSize').textContent=`${cropSession.region.width} × ${cropSession.region.height} 像素`; layer.batchDraw();
    }
    cropSession={id:o.id,region:null,reset(){rect.setAttrs({x:pad,y:pad,width:iw,height:ih,scaleX:1,scaleY:1});handles.forceUpdate();update();}};
    rect.dragBoundFunc(pos=>{const b=bounds();return {x:Math.max(pad,Math.min(pad+iw-b.width,pos.x)),y:Math.max(pad,Math.min(pad+ih-b.height,pos.y))};});
    rect.on('dragmove transform',update); update();
  }
  function applyCrop() {
    if(!cropSession)return; const o=objects.find(item=>item.id===cropSession.id); if(!o)return;
    const region={...cropSession.region}; o.cropRect=region; o.cropZoom=1;o.cropX=0;o.cropY=0;
    if($('cropResizeFrame').checked){o.h=o.w*region.height/region.width;o.fit='contain';}
    commit(); $('cropDialog').close(); render(); toast('已套用裁切，可使用復原或再次裁切調整');
  }
  $('cropPhotoBtn').onclick=openCrop; $('applyCropBtn').onclick=applyCrop;
  $('cancelCropBtn').onclick=()=>$('cropDialog').close(); $('cropCloseBtn').onclick=()=>$('cropDialog').close();
  $('resetCropArea').onclick=()=>cropSession?.reset();
  $('cropDialog').addEventListener('close',()=>{cropStage?.destroy();cropStage=null;cropSession=null;});
  function duplicate() { const o = selectedObject(); if (!o) return; const copy = {...o,id:nextId++,x:o.x+10,y:o.y+10}; objects.push(copy); selected=copy.id; commit(); render(); }
  function remove() { if (!selected) return; objects=objects.filter(o=>o.id!==selected); selected=null; commit(); render(); }
  function reorder(delta) { const i=objects.findIndex(o=>o.id===selected), n=i+delta; if(i<0||n<0||n>=objects.length)return; [objects[i],objects[n]]=[objects[n],objects[i]]; commit(); render(); }
  async function exportPDF() {
    if (importing) return toast('照片尚在讀取中，完成後即可下載'); commit(); const button=$('exportBtn'); button.disabled=true; button.textContent='正在準備 PDF…';
    try { await Promise.all(objects.filter(o=>o.type==='text').map(loadFont)); await document.fonts.ready; await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); const canvas=renderSheet(Math.round(297/25.4*300)/W,$('printGuides').checked); const pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:[297,210],compress:true}); pdf.setProperties({title:'Foldroom A4 Photo Zine',creator:'Foldroom'}); pdf.addImage(canvas.toDataURL('image/jpeg',.98),'JPEG',0,0,297,210); const blob=pdf.output('blob'); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='摺景-A4攝影小誌.pdf'; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000); dirty=false; toast('PDF 已準備好，請以 A4 橫式、單面、100% 列印'); }
    catch(error) { console.error(error); toast(error.message?.startsWith('字體')?error.message:'PDF 產生失敗，請減少大型圖片後重試'); }
    finally { button.disabled=false; button.innerHTML='下載列印 PDF <span>↓</span>'; }
  }
  // All preview, export, and editing operations use the same object model above.
  stage.on('click tap',e=>{if(e.target===stage||e.target.name()==='paper')select(null);});
  $('uploadBtn').onclick=()=>{replacing=false;$('fileInput').click();};
  $('replaceBtn').onclick=()=>{replacing=true;$('fileInput').click();};
  $('fileInput').onchange=async e=>{const files=[...e.target.files];e.target.value='';const id=replacing?selected:null;replacing=false;await importFiles(files,id);};
  document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();$('canvasViewport').classList.add('dragover');}});
  document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('canvasViewport').classList.remove('dragover');});
  document.addEventListener('drop',e=>{e.preventDefault();$('canvasViewport').classList.remove('dragover');if(e.dataTransfer.files.length)importFiles([...e.dataTransfer.files]);});
  $('addTextBtn').onclick=addText; $('addMountBtn').onclick=addMount; $('addMountAllBtn').onclick=addMountAll; $('resetMountSize').onclick=()=>{const o=selectedObject();if(o?.type==='mount'){o.w=54*MM;o.h=86*MM;commit();render();}}; $('undoBtn').onclick=()=>moveHistory(-1); $('redoBtn').onclick=()=>moveHistory(1); $('duplicateBtn').onclick=duplicate; $('deleteBtn').onclick=remove; $('backwardBtn').onclick=()=>reorder(-1); $('forwardBtn').onclick=()=>reorder(1);
  $('showGuides').onchange=render; $('zoom').onchange=resize; $('targetPage').onchange=()=>{if(!objects.length)render();};
  $('editTab').onclick=()=>setView('edit');$('previewTab').onclick=()=>setView('preview');$('prevSpread').onclick=()=>{spread=Math.max(0,spread-1);renderBook();};$('nextSpread').onclick=()=>{spread=Math.min(4,spread+1);renderBook();};
  document.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{style=b.dataset.style;document.querySelectorAll('[data-style]').forEach(btn=>btn.classList.toggle('active',btn===b));toast(`${style==='margin'?'白邊':'滿版'}將用於下一次套版或新增照片`);});
  document.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>applyTemplate(b.dataset.template));
  const fields={fontSize:['fontSize',1],fontWeight:['fontWeight',1],textValue:['text'],fontFamily:['font'],textColor:['color'],textAlign:['align'],verticalAlign:['verticalAlign'],mountMode:['mountMode'],cropZoom:['cropZoom',1],cropX:['cropX',1],cropY:['cropY',1]};
  for(const [id,[key,factor]] of Object.entries(fields)) {
    const el=$(id); const change=()=>{const o=selectedObject();if(!o)return;let value=factor?Number(el.value)*factor:el.value;if(factor&&(!Number.isFinite(value)||el.value===''))return;if(['w','h'].includes(key))value=Math.max(3,Math.min(3000,value));if(key==='fontSize')value=Math.max(4,Math.min(200,value));o[key]=value;if(key==='font'){const weights=fontWeights[value];o.fontWeight=weights.reduce((best,w)=>Math.abs(w-(o.fontWeight||400))<Math.abs(best-(o.fontWeight||400))?w:best,weights[0]);if(fontLoads.get(fontKey(o))?.status==='failed')fontLoads.delete(fontKey(o));}render();};
    el.addEventListener('input',change);el.addEventListener('change',()=>{change();commit();});
  }
  $('resetCrop').onclick=()=>{const o=selectedObject();if(o?.type==='photo'){Object.assign(o,{cropZoom:1,cropX:0,cropY:0});commit();render();}};
  $('exportBtn').onclick=exportPDF; $('helpBtn').onclick=()=>$('helpDialog').showModal(); document.querySelector('.dialog-close').onclick=()=>$('helpDialog').close();
  document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;const cmd=e.ctrlKey||e.metaKey;if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();moveHistory(e.shiftKey?1:-1);}else if(cmd&&e.key.toLowerCase()==='y'){e.preventDefault();moveHistory(1);}else if(cmd&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}else if(e.key==='Escape')select(null);else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){const o=selectedObject();if(!o)return;e.preventDefault();const d=e.shiftKey?10:1;o.x+=e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0;o.y+=e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0;commit();render();}});
  window.addEventListener('beforeunload',e=>{if(dirty||JSON.stringify(objects)!==history[historyIndex]){e.preventDefault();e.returnValue='';}});
  new ResizeObserver(resize).observe($('canvasViewport'));
  // Optional browser agent support; unsupported browsers retain all editing features.
  const modelContext=document.modelContext;
  if(modelContext?.registerTool){try{Promise.resolve(modelContext.registerTool({name:'read_zine_layout',title:'讀取小誌版面',description:'Read page order and current photo/text object layout without reading local photo bytes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected empty object');return {paper:{widthMM:297,heightMM:210},pageOrder:PAGE_ORDER,objects:objects.map(o=>({...o})),photoCount:assets.size};}})).catch(()=>{});}catch{}}
  render();resize();
})();
