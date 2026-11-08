  // Render the existing analysis directly; no literary claims are generated here.
  const smallReadingScreen=matchMedia('(max-width:740px)');
  let overviewGroup=analysis.overview.find(n=>n.id===saved.overviewGroup)?.id||analysis.overview[0]?.id;
  let activeTheme=analysis.themes.find(t=>t.id===saved.activeTheme)?.id||analysis.themes[0]?.id;
  const themePicker=byId('theme-picker');
  const overviewPicker=byId('overview-path-picker');
  const syncThemePicker=()=>{themePicker.open=!smallReadingScreen.matches;overviewPicker.open=!smallReadingScreen.matches;};
  syncThemePicker();smallReadingScreen.addEventListener('change',syncThemePicker);
  themePicker.addEventListener('toggle',()=>{if(!smallReadingScreen.matches&&!themePicker.open)themePicker.open=true;});
  overviewPicker.addEventListener('toggle',()=>{if(!smallReadingScreen.matches&&!overviewPicker.open)overviewPicker.open=true;});
  function evidenceFigure(e,withEvent=false){
    const source=sourceIndex.get(e.paragraph_id),figure=element('figure',undefined,'reading-evidence');
    if(!source)return figure;
    figure.dataset.paragraphId=e.paragraph_id;
    figure.append(element('figcaption',`${source.section_title} · ${source.id}`),element('blockquote',e.quote));
    const actions=element('div',undefined,'evidence-actions'),locate=element('button','查看引用与定位');
    locate.addEventListener('click',()=>openSource(e.paragraph_id,e.quote));actions.append(locate);
    if(withEvent){const event=analysis.events.find(item=>item.evidence.some(ref=>ref.paragraph_id===e.paragraph_id));if(event){const jump=element('button','在时间线中阅读 →');jump.addEventListener('click',()=>openReadingEvent(event));actions.append(jump);}}
    figure.append(actions);return figure;
  }
  function openReadingEvent(event){
    const search=byId('event-search'),phase=byId('event-phase');if(search)search.value='';if(phase)phase.value='0-100';renderEvents();selectTab('timeline');
    const row=[...byId('events').children].find(node=>node.dataset.eventId===event.id);row?.scrollIntoView({behavior:'smooth',block:'center'});if(row){row.tabIndex=-1;row.focus({preventScroll:true});}
  }
  function openReadingRange(low,high){
    const search=byId('event-search'),phase=byId('event-phase');if(search)search.value='';if(phase){const value=`${low}-${high}`;if(![...phase.options].some(o=>o.value===value)){const option=element('option',`第 ${low}—${high} 回`);option.value=value;phase.append(option);}phase.value=value;}
    renderEvents();selectTab('timeline');byId('timeline').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function countOverviewLeaves(node){return node.children.length?node.children.reduce((n,child)=>n+countOverviewLeaves(child),0):1;}
  function renderOverview(){
    const menu=byId('overview-categories');menu.replaceChildren();
    analysis.overview.forEach((node,i)=>{const button=element('button');button.dataset.overviewGroup=node.id;button.setAttribute('aria-pressed',String(node.id===overviewGroup));button.append(element('span',String(i+1).padStart(2,'0'),'category-number'));const title=element('span',node.label,'category-name');title.append(element('span',`${countOverviewLeaves(node)} 条阅读线索`,'category-count'));button.append(title);button.addEventListener('click',()=>{overviewGroup=node.id;saved.overviewGroup=node.id;renderOverview();save();if(smallReadingScreen.matches){overviewPicker.open=false;byId('overview-reader').scrollIntoView({behavior:'smooth',block:'start'});}});menu.append(button);});
    const root=byId('overview-content'),group=analysis.overview.find(n=>n.id===overviewGroup);root.replaceChildren();
    byId('overview-group-title').textContent=group?.label||'阅读线索';
    byId('overview-path-title').textContent=group?.label||'阅读路径';
    byId('overview-group-note').textContent='展开一条线索，查看相关事件与原文依据。';
    if(!group){paragraph(root,'本次分析还没有总览线索。','empty');return;}
    const entries=group.children.length?group.children:[group];
    function nodeCard(node,index,depth=0){
      const card=element('details',undefined,'story-stage');card.dataset.overviewNode=node.id;card.open=index===0&&depth===0;
      const summary=element('summary'),range=node.label.match(/^第\s*(\d+)\s*[—–－-]\s*(\d+)\s*回[｜|：:]?\s*(.*)$/);
      summary.append(element('span',String(index+1).padStart(2,'0'),'stage-number'));
      if(range)summary.append(element('span',`第 ${range[1]}—${range[2]} 回`,'stage-range'),element('span',range[3]||node.label,'stage-title'));else summary.append(element('span',node.label,'stage-title'));
      card.append(summary);const body=element('div',undefined,'stage-body');
      if(node.classification!=='fact'||node.layer!=='story')badges(body,node);
      if(range){
        const events=analysis.events.filter(e=>{const ch=Number(e.title.match(/第(\d+)回/)?.[1]);return ch>=Number(range[1])&&ch<=Number(range[2]);}).sort((a,b)=>a.narrative_order-b.narrative_order);
        if(events.length){paragraph(body,`本阶段收录 ${events.length} 条事件线索，以下从叙述起点进入。`,'stage-description');const previews=element('div',undefined,'stage-events');for(const event of events.slice(0,2)){const button=element('button',undefined,'event-preview');button.dataset.eventId=event.id;button.append(element('span',`${label[event.classification]} · ${label[event.layer]}`),element('strong',event.title));button.addEventListener('click',()=>openReadingEvent(event));previews.append(button);}body.append(previews);const actions=element('div',undefined,'stage-actions'),all=element('button',`查看这 ${events.length} 条事件 →`);all.addEventListener('click',()=>openReadingRange(Number(range[1]),Number(range[2])));actions.append(all);body.append(actions);}
      }
      if(node.children.length){const children=element('div',undefined,'story-stages');node.children.forEach((child,i)=>children.append(nodeCard(child,i,depth+1)));body.append(children);}
      if(node.evidence.length){const details=element('details',undefined,'stage-evidence');details.append(element('summary',`原文依据 · ${node.evidence.length} 处引用`));const list=element('div',undefined,'reading-evidence-list');node.evidence.forEach(e=>list.append(evidenceFigure(e)));details.append(list);body.append(details);}
      card.append(body);return card;
    }
    entries.forEach((node,i)=>root.append(nodeCard(node,i)));
    if(group.children.length&&group.evidence.length){const refs=element('details',undefined,'stage-evidence');refs.append(element('summary','这一组线索的原文依据'));group.evidence.forEach(e=>refs.append(evidenceFigure(e)));root.append(refs);}
  }
  const overviewStats=byId('overview-stats');for(const [number,title]of [[book.sections.filter(s=>s.kind==='content').length,'正文分节'],[analysis.characters.length,'人物档案'],[analysis.themes.length,'主题读法']]){const stat=element('span');stat.append(element('strong',String(number)),document.createTextNode(title));overviewStats.append(stat);}
  const edition=byId('overview-edition');paragraph(edition,`${book.title} · ${book.author||'作者未注明'}。本页依据本次提供的具体版本，允许全书剧透。`);paragraph(edition,'事实、梦境、传闻与阅读解释分别标注；章节与段落 ID 用于回到这一版本的原文。');const editionWarnings=element('ul');book.warnings.forEach(warning=>editionWarnings.append(element('li',warning)));edition.append(editionWarnings);paragraph(edition,`版本指纹：${book.source.sha256}`);
  function filteredThemes(){const query=byId('theme-search').value.trim().toLocaleLowerCase();return analysis.themes.filter(t=>[t.title,t.description,...t.alternative_readings,...t.evidence.map(e=>e.quote)].join(' ').toLocaleLowerCase().includes(query));}
  function chooseTheme(id,scroll=true){activeTheme=id;saved.activeTheme=id;renderThemes();save();if(smallReadingScreen.matches){themePicker.open=false;if(scroll)byId('theme-reader').scrollIntoView({behavior:'smooth',block:'start'});}}
  function renderThemes(){
    const shown=filteredThemes(),menu=byId('theme-directory');menu.replaceChildren();
    if(!shown.some(t=>t.id===activeTheme))activeTheme=shown[0]?.id;
    byId('theme-count').textContent=`${shown.length} / ${analysis.themes.length} 个主题`;
    shown.forEach(theme=>{const index=analysis.themes.indexOf(theme),button=element('button',undefined,'theme-choice');button.dataset.themeId=theme.id;button.setAttribute('aria-pressed',String(theme.id===activeTheme));button.setAttribute('aria-label',theme.title);button.append(element('span',String(index+1).padStart(2,'0'),'theme-choice-number'));const text=element('span');text.append(element('strong',theme.title),element('small',`${theme.evidence.length} 处引用 · ${theme.alternative_readings.length} 种其他读法`));button.append(text);button.addEventListener('click',()=>chooseTheme(theme.id));menu.append(button);});
    const theme=shown.find(t=>t.id===activeTheme),root=byId('theme-content');root.replaceChildren();delete root.dataset.themeId;
    byId('theme-prev').disabled=!theme||shown.indexOf(theme)===0;byId('theme-next').disabled=!theme||shown.indexOf(theme)===shown.length-1;
    byId('theme-position').textContent=theme?`${String(analysis.themes.indexOf(theme)+1).padStart(2,'0')} / ${String(analysis.themes.length).padStart(2,'0')}`:'暂无匹配主题';
    byId('theme-picker-title').textContent=theme?`主题目录 · ${analysis.themes.length} 个主题`:'主题目录 · 请调整关键词';
    if(!theme){paragraph(menu,'没有匹配的主题，试试人物、物件或原文关键词。','theme-empty');paragraph(root,'没有匹配的主题，请在目录中修改检索词。','theme-empty');return;}
    root.dataset.themeId=theme.id;
    root.append(element('h3',theme.title,'theme-title'));badges(root,theme);
    const thesis=element('div',undefined,'theme-thesis');thesis.append(element('p','核心读法','kicker'));paragraph(thesis,theme.description);root.append(thesis);
    root.append(element('h4',`沿着 ${theme.evidence.length} 处引用回到书里`,'theme-section-title'));paragraph(root,'短引文支持这条读法；点击查看章节、段落定位与事件背景。','theme-section-note');
    const evidenceList=element('div',undefined,'reading-evidence-list');theme.evidence.forEach((e,i)=>{const figure=evidenceFigure(e,true);figure.hidden=i>=3;evidenceList.append(figure);});root.append(evidenceList);
    if(theme.evidence.length>3){let expanded=false;const more=element('button',`展开其余 ${theme.evidence.length-3} 处引用`,'theme-more-evidence');more.setAttribute('aria-expanded','false');more.addEventListener('click',()=>{expanded=!expanded;[...evidenceList.children].forEach((e,i)=>e.hidden=!expanded&&i>=3);more.textContent=expanded?'收起更多引用':`展开其余 ${theme.evidence.length-3} 处引用`;more.setAttribute('aria-expanded',String(expanded));});root.append(more);}
    if(theme.alternative_readings.length){const alternatives=element('details',undefined,'theme-alternatives');alternatives.append(element('summary',`换一种角度 · ${theme.alternative_readings.length} 种其他可能读法`));const list=element('ol');theme.alternative_readings.forEach(reading=>list.append(element('li',reading)));alternatives.append(list);root.append(alternatives);}
    const jump=element('button','↑ 回到主题目录，选择其他读法','theme-index-jump');jump.addEventListener('click',()=>{themePicker.open=true;themePicker.scrollIntoView({behavior:'smooth',block:'start'});});root.append(jump);
  }
  byId('theme-search').addEventListener('input',()=>{renderThemes();saved.activeTheme=activeTheme;save();});
  for(const [id,delta]of [['theme-prev',-1],['theme-next',1]])byId(id).addEventListener('click',()=>{const shown=filteredThemes(),next=shown[shown.findIndex(t=>t.id===activeTheme)+delta];if(next)chooseTheme(next.id);});
  renderOverview();renderThemes();
