// Whether a WebGL context is drawn in software (no GPU), such as headless
// Chromium in CI or a machine with graphics acceleration off. Such a renderer
// rasterises every pixel on the CPU, so the game and the menu backdrop draw
// fewer pixels and frames there to keep the page responsive.

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** From the driver's renderer string, where the browser shares it. */
export function isSoftwareGl(gl) {
  try {
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
    return SOFTWARE_GL.test(String(name ?? ''));
  } catch {
    return false;
  }
}
