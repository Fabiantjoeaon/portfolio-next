import { Pane } from "tweakpane";
import { getFlag } from "../lib/query.js";

const debug = getFlag("debug");
let pane = null;
if (debug) {
  pane = new Pane({
    title: "Controls",
  });
}
export default pane;

// export function setupPane(controls, api) {

//   pane.addBinding(controls, "rotateX", {
//     label: "rot X",
//     min: 0.0,
//     max: 3.0,
//     step: 0.01,
//   });

//   pane.addBinding(controls, "rotateY", {
//     label: "rot Y",
//     min: 0.0,
//     max: 3.0,
//     step: 0.01,
//   });

//   const colorBinding = pane.addBinding(controls, "color", {
//     label: "color",
//     view: "color",
//   });
//   colorBinding.on("change", (ev) => {});

//   const lightBinding = pane.addBinding(controls, "lightIntensity", {
//     label: "light",
//     min: 0.0,
//     max: 3.0,
//     step: 0.01,
//   });
//   lightBinding.on("change", (ev) => {});

//   return pane;
// }
