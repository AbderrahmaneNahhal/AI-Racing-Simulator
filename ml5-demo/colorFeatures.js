// RGB descriptors, not image recognition or a car-driving brain.
function liveryFeatures(hex) {
  if(typeof hex!=='string'||!/^#[0-9a-f]{6}$/i.test(hex))throw new Error('Choisissez une couleur RGB valide.');
  return [1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255).concat(.25);
}
const LIVERY_EXAMPLES=[['#dc282d','Rouge'],['#ff4637','Rouge'],['#2878e6','Bleu'],['#37a0ff','Bleu'],
  ['#32be5a','Vert'],['#50e678','Vert'],['#e6be1e','Jaune'],['#ffdc46','Jaune']];
