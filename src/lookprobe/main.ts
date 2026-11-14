// Look probe: one fixed scene, rendered with the camera of Ramon's reference image, to be judged side by side with it.
// The address options are those of the stage (see stage.ts).
import { buildScene } from './scene';
import { showError, stage } from './stage';

stage(buildScene).catch(showError);
