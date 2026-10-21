let liveryClassifier=null,liveryExamples=0,liveryReady=null;
const ml5Element=id=>document.getElementById(id);
function ml5Message(text){ml5Element('ml5-result').textContent=text;}
function loadLiveryClassifier() {
  if(liveryReady)return liveryReady;
  ml5Message('Chargement de ML5…');
  liveryReady=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/ml5@0.12.2/dist/ml5.min.js';
    script.onerror=()=>reject(new Error('ML5 non chargé. Vérifiez Internet et réessayez.'));
    script.onload=()=>{
      try {
        if(!globalThis.ml5||typeof ml5.KNNClassifier!=='function')throw new Error('API ML5 KNNClassifier indisponible.');
        liveryClassifier=ml5.KNNClassifier();
        LIVERY_EXAMPLES.forEach(([color,label])=>liveryClassifier.addExample(liveryFeatures(color),label));
        liveryExamples=LIVERY_EXAMPLES.length;
        ml5Element('ml5-predict').disabled=false;ml5Element('ml5-add').disabled=false;
        ml5Element('ml5-count').textContent=liveryExamples+' exemples actifs';
        ml5Message('ML5 prêt : 8 exemples réellement ajoutés au classifieur.');resolve(liveryClassifier);
      }catch(error){reject(error);}
    };
    document.head.appendChild(script);
  }).catch(error=>{liveryReady=null;ml5Message(error.message);throw error;});
  return liveryReady;
}
async function classifyLivery(hex) {
  const features=liveryFeatures(hex),classifier=await loadLiveryClassifier();
  const result=await classifier.classify(features,3);
  if(!result||typeof result.label!=='string')throw new Error('Résultat ML5 invalide.');
  const votes=Object.entries(result.confidencesByLabel||result.confidences||{}).map(([label,value])=>`${label} ${Math.round(value*100)} %`).join(' · ');
  ml5Message(`ML5 prédit : ${result.label}. Votes : ${votes}`);
  return result;
}
ml5Element('ml5-start').addEventListener('click',()=>loadLiveryClassifier().catch(()=>{}));
ml5Element('ml5-predict').addEventListener('click',()=>classifyLivery(ml5Element('livery-color').value).catch(error=>ml5Message(error.message)));
ml5Element('ml5-add').addEventListener('click',()=>{
  try {
    if(!liveryClassifier)throw new Error('Chargez d’abord ML5.');
    if(liveryExamples>=64)throw new Error('Maximum 64 exemples ; rechargez la page pour recommencer.');
    const label=ml5Element('livery-label').value.trim();if(!label||label.length>40)throw new Error('Nom de famille requis (1–40 caractères).');
    liveryClassifier.addExample(liveryFeatures(ml5Element('livery-color').value),label);liveryExamples++;
    ml5Element('ml5-count').textContent=liveryExamples+' exemples actifs';ml5Message('Exemple ajouté à ML5 : '+label+'.');
  }catch(error){ml5Message(error.message);}
});
