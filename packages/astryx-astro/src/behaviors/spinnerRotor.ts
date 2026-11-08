/**
 * data-ax-spinner-rotor — port of @astryxdesign/core Spinner/spinnerRotor.ts
 * (syncRotationPhase): pin every ring's rotation to the document timeline's origin, so
 * spinners inserted seconds apart turn in phase. Rotors are collected and pinned in one
 * frame (getAnimations() resolves style and startTime dirties it again). Reads nothing back:
 * geometry comes from the cascade.
 */
import {defineBehavior} from '../elements/behavior';

const pending = new Set<Element>();
let scheduled = false;

function pinRotorsToTimelineOrigin() {
  scheduled = false;
  const animations: Animation[] = [];
  for (const rotor of pending) animations.push(...rotor.getAnimations());
  pending.clear();
  for (const animation of animations) animation.startTime = 0;
}

defineBehavior('spinner-rotor', (rotor) => {
  pending.add(rotor);
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(pinRotorsToTimelineOrigin);
  }
  return () => { pending.delete(rotor); };
});
