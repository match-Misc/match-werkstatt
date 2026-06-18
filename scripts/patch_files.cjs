const fs = require('fs');

function patchWorkshop() {
  let content = fs.readFileSync('src/components/WorkshopOrderDetails.tsx', 'utf8');
  
  // Replace the filter
  content = content.replace(
    /filter\(\(doc: any\) => !doc\.componentId\)/g,
    "filter((doc: any) => !doc.componentId && !doc.url?.includes('00_Interne'))"
  );
  
  // Replace tooltips
  content = content.replace(
    /title=\{doc\.name\}/g,
    "title={doc.networkPath || (doc.url ? decodeURIComponent(doc.url).replace(/^\\/(uploads|network-files)\\//, '') : doc.name)}"
  );
  
  // Bauteile tooltips don't have title={doc.name}, they just have {doc.name} inside a span.
  // It's harder to regex. Let's leave them for now, or just replace the generic one.
  
  fs.writeFileSync('src/components/WorkshopOrderDetails.tsx', content);
}

function patchOrder() {
  let content = fs.readFileSync('src/components/OrderDetails.tsx', 'utf8');
  
  // Replace the filter
  content = content.replace(
    /filter\(\(doc: any\) => !doc\.componentId && !doc\.url\?\.includes\('00_Interne Dokumente'\)\)/g,
    "filter((doc: any) => !doc.componentId && !doc.url?.includes('00_Interne'))"
  );
  
  // Replace tooltips
  content = content.replace(
    /title=\{doc\.networkPath \|\| doc\.url \|\| doc\.name\}/g,
    "title={doc.networkPath || (doc.url ? decodeURIComponent(doc.url).replace(/^\\/(uploads|network-files)\\//, '') : doc.name)}"
  );
  
  fs.writeFileSync('src/components/OrderDetails.tsx', content);
}

patchWorkshop();
patchOrder();
