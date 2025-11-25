
export function sanitizePotentialJson(str) {
  if (!str || typeof str !== "string") return "";
  let t = str.trim();

  t = t.replace(/^```json/i, "").replace(/```$/i, "");

  
  t = t.replace(/"\s*:\s*\[\s*$/gm, '" : []');

  
  t = t.replace(/}"\s*,\s*"({)/g, '},$1');

  t = t.replace(/(})"\s*,\s*"/g, '$1,"');
 
  t = t.replace(/(})"\s*\]/g, '$1]');
  

  for (let i = 0; i < 3; i++) {
    const before = t;
   
    t = t.replace(/"({"[^"]+"[^}]*})"/g, (match, obj) => {
     
      if (obj.startsWith('{') && obj.includes('"') && obj.includes(':')) {
        return obj;
      }
      return match;
    });
    
    if (t === before) break;
  }

  t = t.replace(/,\s*([}\]])/g, "$1");

  t = t.replace(/,\s*,/g, ',');

  return t;
}

