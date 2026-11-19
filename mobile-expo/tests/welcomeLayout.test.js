import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
import hermesParser from 'hermes-parser';
import Yoga from 'yoga-layout';

const require = createRequire(import.meta.url);
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const screenSource = process.env.MONIMOB_TEST_WELCOME_SOURCE
  ? fs.readFileSync(process.env.MONIMOB_TEST_WELCOME_SOURCE, 'utf8')
  : read('../src/screens/authentication.js');
const screen = parse(screenSource, { sourceType: 'module', plugins: ['jsx'] });
const theme = parse(read('../src/theme/styles.js'), { sourceType: 'module' });
const nativeSheet = hermesParser.parse(fs.readFileSync(path.join(path.dirname(require.resolve('react-native/package.json')), 'Libraries/StyleSheet/StyleSheetExports.js'), 'utf8'), { sourceType: 'module', babel: true });
const png = fs.readFileSync(new URL('../assets/welcome-background.png', import.meta.url));
const intrinsic = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };

function* walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type) yield node;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const item of value) yield* walk(item);
    else if (value && typeof value === 'object') yield* walk(value);
  }
}
const nodes = [...walk(screen)];
const image = nodes.find(node => node.type === 'JSXOpeningElement' && (node.name.name === 'LinearGradient' || node.name.name === 'Image' && node.attributes.some(attr => attr.name?.name === 'source' && JSON.stringify(attr.value).includes('welcome-background.png'))));
const foreground = nodes.find(node => node.type === 'JSXOpeningElement' && node.name.name === 'SafeAreaView');
const attribute = (node, name) => node.attributes.find(attr => attr.name?.name === name)?.value;
function variable(ast, name) {
  return [...walk(ast)].find(node => node.type === 'VariableDeclarator' && node.id.name === name)?.init;
}
const themeObject = variable(theme, 'styles').arguments[0];
const nativeExports = nativeSheet.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
const property = (object, key) => object.properties.find(prop => prop.key?.name === key || prop.key?.value === key)?.value;
function value(node, context = theme) {
  if (!node) return undefined;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(prop => [prop.key.name || prop.key.value, value(prop.value, context)]));
  if (node.type === 'Identifier') return value(variable(context, node.name), context);
  if (node.type === 'ArrayExpression') return Object.assign({}, ...node.elements.map(item => value(item, context)).filter(Boolean));
  if (node.type === 'MemberExpression' && node.object.name === 'styles') return value(property(themeObject, node.property.name));
  if (node.type === 'MemberExpression' && node.object.name === 'StyleSheet') return value(property(nativeExports, node.property.name), nativeSheet);
  throw new Error('Unsupported layout expression: ' + node.type);
}
const backgroundStyle = value(attribute(image, 'style').expression);
const viewportStyle = value(attribute(foreground, 'style').expression);

function apply(node, style) {
  for (const [key, val] of Object.entries(style || {})) {
    if (key === 'position') { node.setPositionType(val === 'absolute' ? Yoga.POSITION_TYPE_ABSOLUTE : Yoga.POSITION_TYPE_RELATIVE); continue; }
    const edges = { top: Yoga.EDGE_TOP, right: Yoga.EDGE_RIGHT, bottom: Yoga.EDGE_BOTTOM, left: Yoga.EDGE_LEFT };
    if (key in edges) { node.setPosition(edges[key], val); continue; }
    const method = { flex: 'setFlex', width: 'setWidth', height: 'setHeight', minHeight: 'setMinHeight', minWidth: 'setMinWidth', maxHeight: 'setMaxHeight', maxWidth: 'setMaxWidth' }[key];
    if (method) node[method](val);
  }
}
function layout(width, height, style = backgroundStyle, asset = intrinsic, inset = 0) {
  const root = Yoga.Node.create(), background = Yoga.Node.create(), safe = Yoga.Node.create(), scroll = Yoga.Node.create();
  root.setWidth(width); root.setHeight(height);
  apply(background, { ...asset, ...style }); apply(safe, viewportStyle); apply(scroll, viewportStyle);
  safe.setPadding(Yoga.EDGE_TOP, inset); safe.setPadding(Yoga.EDGE_BOTTOM, inset);
  root.insertChild(background, 0); root.insertChild(safe, 1); safe.insertChild(scroll, 0);
  root.calculateLayout(width, height, Yoga.DIRECTION_LTR);
  const measured = { background: background.getComputedLayout(), safe: safe.getComputedLayout(), scroll: scroll.getComputedLayout() };
  root.freeRecursive(); return measured;
}

test('the installed React Native API and real PNG reproduce the previous off-screen opening', () => {
  // Resolve the removed property from the actual native implementation, rather
  // than supplying it in a mock. This was the gap in the old component tests.
  const missing = value(property(nativeExports, 'absoluteFillObject'), nativeSheet);
  assert.equal(missing, undefined);
  const broken = layout(370, 823, missing ?? null);
  assert.equal(broken.safe.top, intrinsic.height);
  assert.equal(broken.scroll.height, 0);
});

test('the real welcome JSX keeps foreground and background inside portrait, landscape and tablet viewports', () => {
  for (const [width, height] of [[320, 568], [370, 823], [430, 932], [800, 360], [1024, 1366]]) {
    const measured = layout(width, height);
    assert.equal(measured.background.left, 0); assert.equal(measured.background.top, 0);
    assert.equal(measured.background.width, width); assert.equal(measured.background.height, height);
    assert.equal(measured.safe.top, 0); assert.equal(measured.safe.height, height);
    assert.ok(measured.scroll.height > 0, `Scroll viewport collapsed at ${width}x${height}`);
  }
});

test('intrinsic image dimensions cannot displace controls, including with system-bar padding', () => {
  for (const asset of [intrinsic, { width: 2048, height: 4096 }, { width: 640, height: 640 }]) {
    const measured = layout(370, 823, backgroundStyle, asset, 40);
    assert.equal(measured.safe.top, 0); assert.equal(measured.background.height, 823);
    assert.equal(measured.scroll.height, 743);
  }
});

test('the decorative background cannot intercept sign-in or registration touches', () => {
  assert.equal(attribute(image, 'pointerEvents')?.value, 'none');
});

test('opening light layers stay outside layout flow and cannot cover accessible controls', () => {
  const effects = parse(read('../src/components/openingVisuals.js'), { sourceType: 'module', plugins: ['jsx'] });
  const layer = [...walk(effects)].find(node => node.type === 'JSXOpeningElement' && node.name.name === 'View');
  const effectStyle = value(attribute(layer, 'style').expression);
  assert.equal(attribute(layer, 'pointerEvents')?.value, 'none');
  assert.equal(attribute(layer, 'importantForAccessibility')?.value, 'no-hide-descendants');
  for (const [width, height] of [[320, 568], [800, 360], [1024, 1366]]) {
    const measured = layout(width, height, effectStyle, { width: 2048, height: 4096 });
    assert.equal(measured.safe.top, 0);
    assert.equal(measured.scroll.height, height);
    assert.equal(measured.background.width, width);
  }
});
