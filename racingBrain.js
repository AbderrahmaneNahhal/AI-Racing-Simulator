// Hidden activation is configurable. Outputs remain sigmoid: Vehicle expects [0,1].
function createRacingModel(config, zeros = false) {
  const model = tf.sequential();
  trainingWidths(config).forEach((units,i)=>{
    const options={units,activation:config.activation||'sigmoid'};
    if(i===0)options.inputShape=[config.sensors];
    if(zeros)Object.assign(options,{kernelInitializer:'zeros',biasInitializer:'zeros'});
    model.add(tf.layers.dense(options));
  });
  model.add(tf.layers.dense({units:2,activation:'sigmoid',...(zeros?{kernelInitializer:'zeros',biasInitializer:'zeros'}:{})}));
  return model;
}
class RacingBrain extends NeuralNetwork {
  constructor(config, model = null) {
    const settings = validateTrainingConfig(config);
    if (!model) model = createRacingModel(settings);
    super(model, settings.sensors, trainingWidths(settings)[0], 2);
    this.config = settings;
    this.lastInputs = [];
    this.lastOutputs = [];
  }

  copy() {
    const copy = new RacingBrain(this.config);
    try {
      // getWeights() returns the model's variables in TF.js 1.1; do not dispose them.
      tf.tidy(() => copy.model.setWeights(this.model.getWeights().map(weight => weight.clone())));
      return copy;
    } catch (error) { copy.dispose(); throw error; }
  }

  predict(inputs) {
    if (inputs.length !== this.input_nodes) throw new Error('Nombre de capteurs incompatible.');
    this.lastInputs = Array.from(inputs);
    this.lastOutputs = tf.tidy(() => {
      const tensor = tf.tensor2d([inputs], [1, this.input_nodes]);
      return Array.from(this.model.predict(tensor).dataSync());
    });
    return this.lastOutputs;
  }

  dispose() {
    if (!this.model.built) this.model.build([null, this.input_nodes]);
    super.dispose();
  }
}
