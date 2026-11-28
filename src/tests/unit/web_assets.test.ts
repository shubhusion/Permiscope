import * as fs from 'fs';
import * as path from 'path';

const webDir = path.resolve(__dirname, '../../../dist/web');
const indexPath = path.join(webDir, 'index.html');
const describeBuilt = fs.existsSync(indexPath) ? describe : describe.skip;

describeBuilt('built web assets', () => {
  test('index references assets that exist', () => {
    const html = fs.readFileSync(indexPath, 'utf-8');
    const js = html.match(/(?:\.\/|\/)assets\/[^"']+\.js/);
    const css = html.match(/(?:\.\/|\/)assets\/[^"']+\.css/);

    expect(js).not.toBeNull();
    expect(css).not.toBeNull();
    const localPath = (value: string) => value.replace(/^\.\//, '').replace(/^\//, '');
    expect(fs.existsSync(path.join(webDir, localPath(js![0])))).toBe(true);
    expect(fs.existsSync(path.join(webDir, localPath(css![0])))).toBe(true);
  });

  test('the demo fixture is included in the build', () => {
    expect(fs.existsSync(path.join(webDir, 'fixtures/demo.json'))).toBe(true);
  });

  test('the built bundle contains the landing page', () => {
    const assetsDir = path.join(webDir, 'assets');
    const bundles = fs.readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
    const content = bundles
      .map((name) => fs.readFileSync(path.join(assetsDir, name), 'utf-8'))
      .join('');
    expect(content).toContain('Governed');
    expect(content).toContain('OPEN THE CONSOLE');
  });
});
