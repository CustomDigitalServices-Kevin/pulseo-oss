// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from './svg-sanitize';

describe('sanitizeSvg', () => {
  it('keeps a clean SVG with paths and circles', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h10v10H2z"/><circle cx="20" cy="20" r="2"/></svg>';
    const out = sanitizeSvg(input);
    expect(out).toContain('<svg');
    expect(out).toContain('<path');
    expect(out).toContain('<circle');
  });

  it('strips inline <script> tags', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="3"/></svg>';
    const out = sanitizeSvg(input);
    expect(out.toLowerCase()).not.toContain('<script');
    expect(out).toContain('<circle');
  });

  it('removes onload event handlers', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>';
    const out = sanitizeSvg(input);
    expect(out.toLowerCase()).not.toContain('onload');
  });

  it('rejects javascript: URI on href', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>';
    const out = sanitizeSvg(input);
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('strips <foreignObject> which can host arbitrary HTML', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="x"/></foreignObject></svg>';
    const out = sanitizeSvg(input);
    expect(out.toLowerCase()).not.toContain('<foreignobject');
    expect(out.toLowerCase()).not.toContain('<iframe');
  });
});
