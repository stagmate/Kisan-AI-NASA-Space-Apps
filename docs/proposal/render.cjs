const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + process.argv[2], { waitUntil: 'load' });
  await p.waitForTimeout(800);
  await p.pdf({ path: process.argv[3], format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:7.5px;color:#5b6a5b;width:100%;padding:0 16mm;display:flex;justify-content:space-between;font-family:Inter,sans-serif"><span>Kisan AI — NASA Space Apps Challenge 2026 proposal</span><span class="pageNumber"></span></div>' });
  await b.close();
})();
