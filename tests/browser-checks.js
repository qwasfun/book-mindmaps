async page => {
  const assert = (condition,message) => {if(!condition)throw new Error(message);};
  const errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('http://127.0.0.1:'))external.push(request.url());});
  await page.setViewportSize({width:1440,height:1080});
  const original=await page.goto(page.url());
  const standalone=await original.text();
  await page.locator('#overview-map').waitFor();
  const overview=page.frameLocator('#overview-map');
  await overview.getByRole('link').first().waitFor();
  const linkCount=await overview.getByRole('link').count();
  assert(linkCount>=10,'总览未显示应有的原文引用');
  await page.screenshot({path:'output/playwright/overview-desktop.png',fullPage:true});
  const transform=()=>overview.locator('markmap-view').evaluate(e=>e.shadowRoot.querySelector('svg g')?.getAttribute('transform'));
  const before=await transform();
  await overview.getByRole('button',{name:'Zoom in',exact:true}).click();
  await overview.locator('markmap-view').evaluate(()=>new Promise(requestAnimationFrame));
  assert((await transform())!==before,'Markmap 放大未改变视图');
  await overview.getByRole('button',{name:'Fit to view',exact:true}).click();
  await overview.getByRole('combobox',{name:'Fold to level'}).selectOption('1');
  await overview.getByRole('button',{name:'Expand all',exact:true}).click();
  await overview.getByRole('link').first().click();
  await page.locator('#source-detail blockquote').waitFor();
  assert((await page.locator('#source-detail').textContent()).includes('归港'),'导图出处未打开证据面板');
  await page.getByRole('button',{name:'查看完整原文段落'}).click();
  assert(await page.locator('#sources').isVisible(),'完整出处页未打开');
  assert(await page.locator('.source-full[open]').count()===1,'对应原文段落没有展开');

  await page.getByRole('tab',{name:'人物关系',exact:true}).click();
  const names=await page.locator('#people button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));
  assert(names.length===3,'示例人物数量不正确');
  for(const name of names){await page.locator('#people').getByRole('button',{name,exact:true}).click();assert(await page.locator('#focus-name').textContent()===name,'人物切换失败：'+name);}
  await page.locator('#person-search').fill('阿岚');assert(await page.locator('#people button').count()===1,'别名检索失败');await page.locator('#person-search').fill('');
  await page.locator('#people').getByRole('button',{name:'林岚',exact:true}).click();
  assert(await page.locator('.relation-node').count()<=6,'关系图超过六位直接相关人物');
  await page.locator('.relation-node').first().press('Enter');
  await page.locator('.relationship-record[open] .ref').first().click();assert(await page.locator('#evidence-dialog').isVisible(),'人物原文弹窗未打开');await page.keyboard.press('Escape');
  const refocusText=await page.locator('.refocus-person').textContent();await page.locator('.refocus-person').click();assert(refocusText.includes(await page.locator('#focus-name').textContent()),'无法以关联人物为中心探索');
  await page.screenshot({path:'output/playwright/characters-desktop.png',fullPage:true});

  await page.getByRole('tab',{name:'双时间线',exact:true}).click();
  await page.getByRole('button',{name:'作者叙述顺序',exact:true}).click();
  assert(await page.locator('.event').first().getAttribute('data-event-id')==='event-return','叙述顺序不正确');
  await page.getByRole('button',{name:'故事发生顺序',exact:true}).click();
  assert(await page.locator('.event').first().getAttribute('data-event-id')==='event-past','发生顺序未把插叙放回过去');
  assert((await page.locator('[data-event-id=event-dream]').textContent()).includes('梦境'),'梦境层次缺失');
  await page.reload();
  assert(await page.locator('#timeline').isVisible(),'阅读视图未在刷新后保留');
  assert(await page.getByRole('button',{name:'故事发生顺序',exact:true}).getAttribute('aria-pressed')==='true','时间线排序未在刷新后保留');
  await page.getByRole('tab',{name:'主题意象',exact:true}).click();
  await page.frameLocator('#themes-map').getByRole('link').first().waitFor();
  assert((await page.locator('#theme-cards').textContent()).includes('阅读解释'),'主题未区分文学解释');
  await page.locator('#theme-cards summary').first().click();
  assert((await page.locator('#theme-cards details').first().textContent()).includes('具体修理'),'其他读法缺失');

  const widths=[375,768,1440];
  for(const width of widths){
    await page.setViewportSize({width,height:1000});
    for(const tab of ['全书总览','人物关系','双时间线','主题意象','原文出处']){
      await page.getByRole('tab',{name:tab,exact:true}).click();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width}px 下 ${tab} 出现横向溢出`);
    }
    await page.getByRole('tab',{name:'全书总览',exact:true}).click();
    if(width===375){
      assert(await page.locator('#reading-outline').getAttribute('open')!==null,'小屏未展开可读文字大纲');
      await page.locator('#outline-tree').getByText('情节主线',{exact:true}).click();
      assert(await page.locator('.outline-leaf').first().isVisible(),'文字大纲不能展开阅读');
    }
    await page.locator('#overview-map').scrollIntoViewIfNeeded();
    await page.frameLocator('#overview-map').getByRole('link').first().scrollIntoViewIfNeeded();
    const mapBounds=await page.frameLocator('#overview-map').locator('svg').first().boundingBox();
    assert(mapBounds&&mapBounds.width>0&&mapBounds.height>0,`${width}px 下导图没有可见画布`);
    await page.screenshot({path:`output/playwright/overview-${width}.png`,fullPage:true});
  }

  // Fulfill the initial document from memory, then run all its embedded resources
  // with the browser offline. No unrestricted local-file permission is needed.
  await page.context().route(page.url(),route=>route.fulfill({status:200,contentType:'text/html',body:standalone}));
  await page.context().setOffline(true);
  await page.reload();
  await page.getByRole('tab',{name:'全书总览',exact:true}).click();
  await page.frameLocator('#overview-map').getByRole('link').first().waitFor();
  await page.getByRole('tab',{name:'主题意象',exact:true}).click();
  await page.frameLocator('#themes-map').getByRole('link').first().waitFor();
  await page.getByRole('tab',{name:'人物关系',exact:true}).click();
  await page.locator('#people').getByRole('button',{name:'林岚',exact:true}).click();
  assert((await page.locator('#focus-name').textContent())==='林岚','离线人物交互失败');
  assert(external.length===0,'离线产物发起了外部网络请求');
  assert(errors.length===0,`浏览器错误：${errors.join('; ')}`);
  await page.context().setOffline(false);
  const source_sha256=await page.evaluate(()=>DATA.book.source.sha256);
  return {ok:true,browser:'Microsoft Edge',source_sha256,viewports:widths,views:5,source_links:linkCount,checks:['Markmap 展开折叠及缩放','出处跳转','全部示例人物与别名检索','局部关系图及人物中心切换','引用弹窗与键盘操作','双时间线与梦境标注','主题多种读法','阅读状态恢复','小屏文字大纲展开','三种宽度五种视图无横向溢出','内存文档离线加载与零外部请求'],console_errors:errors,external_requests:external};
}
