/**
 * @license
 * Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

/// <reference path="../node_modules/@types/mocha/index.d.ts" />


import * as chai from 'chai';
import * as fs from 'fs';
import * as parse5 from 'parse5';
import * as dom5 from '../dom5';

const assert = chai.assert;

suite('dom5', () => {

  suite('Parse5 Node Manipulation', () => {

    const docText = `<!DOCTYPE html>` +
        `<div id='A' qux>a1<div bar='b1' bar='b2'>b1</div>a2</div>` +
        `<div bar='b3 b4'>b3 b4</div>` +
        `<!-- comment -->`;

    let doc = parse5.parse(docText);

    setup(() => {
      doc = parse5.parse(docText);
    });

    suite('Node Identity', () => {
      test('isElement', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        assert(dom5.isElement(divA));
      });

      test('isTextNode', () => {
        const textA1 =
            doc.childNodes![1].childNodes![1].childNodes![0].childNodes![0];
        assert(dom5.isTextNode(textA1));
      });

      test('isCommentNode', () => {
        const commentEnd =
            doc.childNodes![1].childNodes![1].childNodes!.slice(-1)[0];
        assert(dom5.isCommentNode(commentEnd));
      });
    });

    suite('getAttribute', () => {

      test('returns null for a non-set attribute', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        assert.equal(dom5.getAttribute(divA, 'foo'), null);
      });

      test('returns the value for a set attribute', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        assert.equal(dom5.getAttribute(divA, 'id'), 'A');
      });

      test('returns the first value for a doubly set attribute', () => {
        const divB =
            doc.childNodes![1].childNodes![1].childNodes![0].childNodes![1];
        assert.equal(dom5.getAttribute(divB, 'bar'), 'b1');
      });
    });

    suite('hasAttribute', () => {

      test('returns false for a non-set attribute', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        assert.equal(dom5.hasAttribute(divA, 'foo'), false);
      });

      test('returns true for a set attribute', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        assert.equal(dom5.hasAttribute(divA, 'id'), true);
      });

      test('returns true for a doubly set attribute', () => {
        const divB =
            doc.childNodes![1].childNodes![1].childNodes![0].childNodes![1];
        assert.equal(dom5.hasAttribute(divB, 'bar'), true);
      });

      test('returns true for attribute with no value', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        assert.equal(dom5.hasAttribute(divA, 'qux'), true);
      });
    });

    suite('setAttribute', () => {

      test('sets a non-set attribute', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        dom5.setAttribute(divA, 'foo', 'bar');
        assert.equal(dom5.getAttribute(divA, 'foo'), 'bar');
      });

      test('sets and already set attribute', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        dom5.setAttribute(divA, 'id', 'qux');
        assert.equal(dom5.getAttribute(divA, 'id'), 'qux');
      });

      test('sets the first value for a doubly set attribute', () => {
        const divB =
            doc.childNodes![1].childNodes![1].childNodes![0].childNodes![1];
        dom5.setAttribute(divB, 'bar', 'baz');
        assert.equal(dom5.getAttribute(divB, 'bar'), 'baz');
      });

      test('throws when called on a text node', () => {
        const text =
            doc.childNodes![1].childNodes![1].childNodes![0].childNodes![0];
        assert.throws(() => {
          dom5.setAttribute(text, 'bar', 'baz');
        });
      });
    });

    suite('removeAttribute', () => {

      test('removes a set attribute', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        dom5.removeAttribute(divA, 'foo');
        assert.equal(dom5.getAttribute(divA, 'foo'), null);
      });

      test(
          'does not throw when called on a node without that attribute', () => {
            const divA = doc.childNodes![1].childNodes![1].childNodes![0];
            assert.doesNotThrow(() => {
              dom5.removeAttribute(divA, 'ZZZ');
            });
          });
    });

    suite('getTextContent', () => {
      let body = doc.childNodes![1].childNodes![1];

      suiteSetup(() => {
        body = doc.childNodes![1].childNodes![1];
      });

      test('text node', () => {
        const node = body.childNodes![0].childNodes![0];
        const expected = 'a1';
        const actual = dom5.getTextContent(node);
        assert.equal(actual, expected);
      });

      test('comment node', () => {
        const node = body.childNodes!.slice(-1)[0];
        const expected = ' comment ';
        const actual = dom5.getTextContent(node);
        assert.equal(actual, expected);
      });

      test('leaf element', () => {
        const node = body.childNodes![0].childNodes![1];
        const expected = 'b1';
        const actual = dom5.getTextContent(node);
        assert.equal(actual, expected);
      });

      test('recursive element', () => {
        const expected = 'a1b1a2b3 b4';
        const actual = dom5.getTextContent(body);
        assert.equal(actual, expected);
      });
    });

    suite('setTextContent', () => {
      let body: parse5.ASTNode;
      const expected = 'test';

      suiteSetup(() => {
        body = doc.childNodes![1].childNodes![1];
      });

      test('text node', () => {
        const node = body.childNodes![0].childNodes![0];
        dom5.setTextContent(node, expected);
        const actual = dom5.getTextContent(node);
        assert.equal(actual, expected);
      });

      test('comment node', () => {
        const node = body.childNodes!.slice(-1)[0];
        dom5.setTextContent(node, expected);
        const actual = dom5.getTextContent(node);
        assert.equal(actual, expected);
      });

      test('leaf element', () => {
        const node = body.childNodes![0].childNodes![1];
        dom5.setTextContent(node, expected);
        const actual = dom5.getTextContent(node);
        assert.equal(actual, expected);
        assert.equal(node.childNodes!.length, 1);
      });

      test('recursive element', () => {
        dom5.setTextContent(body, expected);
        const actual = dom5.getTextContent(body);
        assert.equal(actual, expected);
        assert.equal(body.childNodes!.length, 1);
      });
    });

    suite('Replace node', () => {
      test('New node replaces old node', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        const newNode = dom5.constructors.element('ul');
        dom5.replace(divA, newNode);
        assert.equal(divA.parentNode, null);
        assert.equal(
            doc.childNodes![1].childNodes![1].childNodes!.indexOf(divA), -1);
        assert.equal(
            doc.childNodes![1].childNodes![1].childNodes!.indexOf(newNode), 0);
      });

      test('accepts document fragments', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        const fragment = dom5.constructors.fragment();
        const span = dom5.constructors.element('span');
        const text = dom5.constructors.text('foo');
        fragment.childNodes!.push(span);
        fragment.childNodes!.push(text);

        dom5.replace(divA, fragment);

        assert.equal(divA.parentNode, null);
        assert.equal(
            doc.childNodes![1].childNodes![1].childNodes!.indexOf(divA), -1);
        assert.equal(
            doc.childNodes![1].childNodes![1].childNodes!.indexOf(span), 0);
        assert.equal(
            doc.childNodes![1].childNodes![1].childNodes!.indexOf(text), 1);
      });
    });

    suite('Remove node', () => {
      test('node is removed from parentNode', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        const parent = divA.parentNode!;
        dom5.remove(divA);
        assert.equal(divA.parentNode, null);
        assert.equal(parent.childNodes!.indexOf(divA), -1);
      });

      test('removed nodes do not throw', () => {
        const divA = doc.childNodes![1].childNodes![1].childNodes![0];
        dom5.remove(divA);
        dom5.remove(divA);
        assert.equal(divA.parentNode, null);
      });
    });

    suite('Remove node, save children', () => {
      test('node is removed and children at same position', () => {
        const html = '<div><em>x</em><span><em>a</em><em>c</em></span>y</div>';
        const ast = parse5.parseFragment(html);
        const span = ast.childNodes![0]!.childNodes![1]!;
        dom5.removeNodeSaveChildren(span);
        assert.deepEqual(
            parse5.serialize(ast),
            '<div><em>x</em><em>a</em><em>c</em>y</div>');
      });
    });

    suite('Remove fake root elements from tree', () => {
      test('Fake root elements will be removed', () => {
        const html = `<div>Just a div</div>`;
        const ast = parse5.parse(html, {locationInfo: true});
        assert.deepEqual(
            parse5.serialize(ast),
            '<html><head></head><body><div>Just a div</div></body></html>');
        dom5.removeFakeRootElements(ast);
        assert.deepEqual(parse5.serialize(ast), html);
      });

      test('Real root elements will be preserved', () => {
        const html =
            '<html><head></head><body><div>Just a div</div></body></html>';
        const ast = parse5.parse(html, {locationInfo: true});
        assert.deepEqual(parse5.serialize(ast), html);
        dom5.removeFakeRootElements(ast);
        assert.deepEqual(parse5.serialize(ast), html);
      });
    });

    suite('Append Node', () => {
      let dom: parse5.ASTNode, div: parse5.ASTNode, span: parse5.ASTNode;

      setup(() => {
        dom = parse5.parseFragment('<div>a</div><span></span>b');
        div = dom.childNodes![0];
        span = dom.childNodes![1];
      });

      test('node is only in one parent', () => {
        const b = dom.childNodes!.slice(-1)[0];
        dom5.append(span, b);
        assert.equal(b.parentNode, span);
        assert.equal(dom.childNodes!.indexOf(b), -1);
      });

      test('node is appended to the end of childNodes', () => {
        let bidx = dom.childNodes!.length - 1;
        const b = dom.childNodes![bidx];
        dom5.append(div, b);
        bidx = div.childNodes!.length - 1;
        assert.equal(div.childNodes![bidx], b);
      });

      test('a node that is appended to its current parent is reordered', () => {
        const bidx = dom.childNodes!.length - 1;
        const b = dom.childNodes![bidx];
        const a = div.childNodes![0];
        dom5.append(div, b);
        dom5.append(div, a);
        assert.equal(div.childNodes![0], b);
        assert.equal(div.childNodes![1], a);
      });

      test('accepts document fragments', () => {
        const fragment = dom5.constructors.fragment();
        const span = dom5.constructors.element('span');
        const text = dom5.constructors.text('foo');
        // hold a reference to make sure append() clears childNodes
        const fragmentChildren = fragment.childNodes!;
        fragmentChildren.push(span);
        fragmentChildren.push(text);

        dom5.append(div, fragment);

        assert.equal(div.childNodes!.indexOf(span), 1);
        assert.equal(div.childNodes!.indexOf(text), 2);
        assert.equal(fragment.childNodes!.length, 0);
        assert.equal(fragmentChildren.length, 0);
      });

      test('append to node with no children', () => {
        const emptyBody = parse5.parse('<head></head><body></body>');
        const body = emptyBody.childNodes![0].childNodes![1];
        const span = dom5.constructors.element('span');
        dom5.append(body, span);

        assert.equal(body.childNodes!.length, 1);
      });
    });

    suite('InsertBefore', () => {
      let dom: parse5.ASTNode, div: parse5.ASTNode, span: parse5.ASTNode,
          text: parse5.ASTNode;

      setup(() => {
        dom = parse5.parseFragment('<div></div><span></span>text');
        div = dom.childNodes![0];
        span = dom.childNodes![1];
        text = dom.childNodes![2];
      });

      test('ordering is correct', () => {
        dom5.insertBefore(dom, span, text);
        assert.equal(dom.childNodes!.indexOf(text), 1);
        const newHtml = parse5.serialize(dom);
        assert.equal(newHtml, '<div></div>text<span></span>');
        dom5.insertBefore(dom, div, text);
        assert.equal(dom.childNodes!.indexOf(text), 0);
      });

      test('accepts document fragments', () => {
        const fragment = dom5.constructors.fragment();
        const span2 = dom5.constructors.element('span');
        const text2 = dom5.constructors.text('foo');
        fragment.childNodes!.push(span2);
        fragment.childNodes!.push(text2);

        dom5.insertBefore(dom, span, fragment);
        assert.equal(dom.childNodes!.indexOf(span2), 1);
        assert.equal(dom.childNodes!.indexOf(text2), 2);
        assert.equal(dom.childNodes!.indexOf(span), 3);
        assert.equal(dom.childNodes!.indexOf(text), 4);
        assert.equal(fragment.childNodes!.length, 0);
      });

    });

    suite('insertAfter', () => {
      let dom: parse5.ASTNode;
      let div: parse5.ASTNode;
      let span: parse5.ASTNode;
      let text: parse5.ASTNode;

      setup(() => {
        dom = parse5.parseFragment('<div></div><span></span>text');
        [div, span, text] = dom.childNodes!;
      });

      test('ordering is correct', () => {
        dom5.insertAfter(dom, div, text);
        assert.equal(parse5.serialize(dom), '<div></div>text<span></span>');
        dom5.insertAfter(dom, span, text);
        assert.equal(parse5.serialize(dom), '<div></div><span></span>text');
      });

      test('accepts document fragments', () => {
        const fragment = parse5.parseFragment('<span></span>foo');
        dom5.insertAfter(dom, span, fragment);
        assert.equal(
            parse5.serialize(dom),
            '<div></div><span></span><span></span>footext');
        assert.equal(fragment.childNodes!.length, 0);
      });

    });

    suite('cloneNode', () => {

      test('clones a node', () => {
        const dom = parse5.parseFragment('<div><span foo="bar">a</span></div>');
        const div = dom.childNodes![0];
        const span = div.childNodes![0];

        const clone = dom5.cloneNode(span);

        assert.equal(clone.parentNode, null);
        assert.equal(span.parentNode, div);

        assert.equal(clone.tagName, 'span');
        assert.equal(dom5.getAttribute(clone, 'foo'), 'bar');

        assert.equal(clone.childNodes![0].nodeName, '#text');
        assert.equal(clone.childNodes![0].value, 'a');
        assert.equal(span.childNodes![0].nodeName, '#text');
        assert.equal(span.childNodes![0].value, 'a');
        assert.notStrictEqual(clone.childNodes![0], span.childNodes![0]);
      });

    });

  });

  suite('Query Predicates', () => {
    const fragText =
        '<div id="a" class="b c"><!-- nametag -->Hello World</div>';
    let frag: parse5.ASTNode;
    suiteSetup(() => {
      frag = parse5.parseFragment(fragText).childNodes![0];
    });

    test('hasTagName', () => {
      let fn = dom5.predicates.hasTagName('div');
      assert.isFunction(fn);
      assert.isTrue(fn(frag));
      fn = dom5.predicates.hasTagName('a');
      assert.isFalse(fn(frag));
    });

    test('hasAttr', () => {
      let fn = dom5.predicates.hasAttr('id');
      assert.isFunction(fn);
      assert.isTrue(fn(frag));
      fn = dom5.predicates.hasAttr('class');
      assert.isTrue(fn(frag));
      fn = dom5.predicates.hasAttr('hidden');
      assert.isFalse(fn(frag));
    });

    test('hasAttrValue', () => {
      let fn = dom5.predicates.hasAttrValue('id', 'a');
      assert.isFunction(fn);
      assert.isTrue(fn(frag));
      fn = dom5.predicates.hasAttrValue('class', 'b c');
      assert.isTrue(fn(frag));
      fn = dom5.predicates.hasAttrValue('id', 'b');
      assert.isFalse(fn(frag));
      fn = dom5.predicates.hasAttrValue('name', 'b');
      assert.isFalse(fn(frag));
    });

    test('hasSpaceSeparatedAttrValue', () => {
      let fn = dom5.predicates.hasSpaceSeparatedAttrValue('class', 'c');
      assert.isFunction(fn);
      assert.isTrue(fn(frag));
      fn = dom5.predicates.hasAttr('class');
      assert.isTrue(fn(frag));
      fn = dom5.predicates.hasSpaceSeparatedAttrValue('id', '');
      assert.isFalse(fn(frag));
    });

    test('hasClass', () => {
      let fn = dom5.predicates.hasClass('b');
      assert.isFunction(fn);
      assert.isTrue(fn(frag));
      fn = dom5.predicates.hasClass('c');
      assert.isTrue(fn(frag));
      fn = dom5.predicates.hasClass('d');
      assert.isFalse(fn(frag));
    });

    test('hasTextValue', () => {
      let fn = dom5.predicates.hasTextValue('Hello World');
      assert.isFunction(fn);
      assert.isTrue(fn(frag));
      const textNode = frag.childNodes![1];
      assert.isTrue(fn(textNode));
      const commentNode = frag.childNodes![0];
      fn = dom5.predicates.hasTextValue(' nametag ');
      assert.isTrue(fn(commentNode));
    });

    test('AND', () => {
      const preds = [
        dom5.predicates.hasTagName('div'),
        dom5.predicates.hasAttrValue('id', 'a'),
        dom5.predicates.hasClass('b')
      ];
      let fn = dom5.predicates.AND.apply(null, preds);
      assert.isFunction(fn);
      assert.isTrue(fn(frag));
      preds.push(dom5.predicates.hasClass('d'));
      fn = dom5.predicates.AND.apply(null, preds);
      assert.isFalse(fn(frag));
    });

    test('OR', () => {
      const preds = [
        dom5.predicates.hasTagName('div'),
        dom5.predicates.hasAttr('hidden')
      ];
      let fn = dom5.predicates.OR.apply(null, preds);
      assert.isFunction(fn);
      assert.isTrue(fn(frag));
      preds.shift();
      fn = dom5.predicates.OR.apply(null, preds);
      assert.isFalse(fn(frag));
    });

    test('NOT', () => {
      const pred = dom5.predicates.hasTagName('a');
      const fn = dom5.predicates.NOT(pred);
      assert.isFunction(fn);
      assert.isTrue(fn(frag));
      assert.isFalse(pred(frag));
    });

    test('Chaining Predicates', () => {
      const fn = dom5.predicates.AND(
          dom5.predicates.hasTagName('div'),
          dom5.predicates.OR(
              dom5.predicates.hasClass('b'), dom5.predicates.hasClass('d')),
          dom5.predicates.NOT(dom5.predicates.hasAttr('hidden')));

      assert.isFunction(fn);
      assert.isTrue(fn(frag));
    });

    test('parentMatches', () => {
      const fragText =
          '<div class="a"><div class="b"><div class="c"></div></div></div>';
      const frag = parse5.parseFragment(fragText);
      const fn = dom5.predicates.parentMatches(dom5.predicates.hasClass('a'));
      assert.isFalse(fn(frag.childNodes![0]));                // a
      assert.isTrue(fn(frag.childNodes![0].childNodes![0]));  // b
      assert.isTrue(
          fn(frag.childNodes![0].childNodes![0].childNodes![0]));  // c
    });
  });

  suite('Query', () => {
    const docText: string = `
<!DOCTYPE html>
<link rel="import" href="polymer.html">
<dom-module id="my-el">
  <template>
    <img src="foo.jpg">
    <a href="next-page.html">Anchor</a>
    sample element
    <!-- comment node -->
  </template>
  <div>
    <a href="another-anchor">Anchor2</a>
  </div>
</dom-module>
<script>Polymer({is: "my-el"})</script>
`.replace(/  /g, '');
    let doc: parse5.ASTNode;

    setup(() => {
      doc = parse5.parse(docText);
    });

    test('nodeWalkAncestors', () => {
      // doc -> dom-module -> div -> a
      const anchor = doc.childNodes![1]
                         .childNodes![1]
                         .childNodes![0]
                         .childNodes![3]
                         .childNodes![1];

      assert(dom5.predicates.hasTagName('a')(anchor));
      const domModule = dom5.nodeWalkAncestors(
          anchor, dom5.predicates.hasTagName('dom-module'));
      assert(domModule);
      const theLinkIsNotAnAncestor =
          dom5.nodeWalkAncestors(anchor, dom5.predicates.hasTagName('link'));
      assert.equal(theLinkIsNotAnAncestor, undefined);
    });

    test('nodeWalk', () => {
      // doc -> body -> dom-module -> template
      const template =
          doc.childNodes![1].childNodes![1].childNodes![0].childNodes![1];
      const templateContent =
          parse5.treeAdapters.default.getTemplateContent(template);

      const textNode = dom5.predicates.AND(
          dom5.isTextNode, dom5.predicates.hasTextValue('\nsample element\n'));

      // 'sample element' text node
      let expected = templateContent.childNodes![4];
      let actual = dom5.nodeWalk(doc, textNode, dom5.childNodesIncludeTemplate);
      assert.equal(expected, actual);

      // <!-- comment node -->
      expected = templateContent.childNodes![5];
      actual = dom5.nodeWalk(
          template, dom5.isCommentNode, dom5.childNodesIncludeTemplate);
      assert.equal(expected, actual);
    });

    test('query', () => {
      const fn = dom5.predicates.AND(
          dom5.predicates.hasTagName('link'),
          dom5.predicates.hasAttrValue('rel', 'import'),
          dom5.predicates.hasAttr('href'));
      const expected = doc.childNodes![1].childNodes![0].childNodes![0];
      const actual = dom5.query(doc, fn);
      assert.equal(expected, actual);
    });

    test('nodeWalkAll', () => {
      const empty = dom5.predicates.AND(dom5.isTextNode, function(node) {
        return !/\S/.test(node.value!);
      });

      // serialize to count for inserted <head> and <body>
      const serializedDoc = parse5.serialize(doc);
      // subtract one to get "gap" number
      const expected = serializedDoc.split('\n').length - 1;
      // add two for normalized text node "\nsample text\n"
      const actual =
          dom5.nodeWalkAll(doc, empty, [], dom5.childNodesIncludeTemplate)
              .length +
          2;

      assert.equal(expected, actual);
    });

    test('queryAll', () => {
      const fn = dom5.predicates.AND(
          dom5.predicates.OR(
              dom5.predicates.hasAttr('href'), dom5.predicates.hasAttr('src')),
          dom5.predicates.NOT(dom5.predicates.hasTagName('link')));

      // doc -> body -> dom-module -> template
      const template =
          doc.childNodes![1].childNodes![1].childNodes![0].childNodes![1];
      const templateContent =
          parse5.treeAdapters.default.getTemplateContent(template);

      // img
      const expected_1 = templateContent.childNodes![1];
      // anchor
      const expected_2 = templateContent.childNodes![3];
      const actual = dom5.queryAll(doc, fn, [], dom5.childNodesIncludeTemplate);

      assert.equal(actual.length, 3);
      assert.equal(expected_1, actual[0]);
      assert.equal(expected_2, actual[1]);
    });
  });

  suite('NodeWalkAllPrior', () => {
    const docText =
        fs.readFileSync(__dirname + '/static/multiple-comments.html', 'utf8');
    let doc: parse5.ASTNode;

    setup(() => {
      doc = parse5.parse(docText);
    });

    test('nodeWalkAllPrior', () => {
      const domModule = dom5.nodeWalkAll(
          doc, dom5.predicates.hasAttrValue('id', 'test-element'))[0];
      const comments = dom5.nodeWalkAllPrior(domModule, dom5.isCommentNode);
      assert.include(dom5.getTextContent(comments[0]), 'test element');
      assert.include(
          dom5.getTextContent(comments[1]), 'hash or path based routing');
      assert.include(
          dom5.getTextContent(comments[2]), 'core-route-selectable.html');
      assert.include(
          dom5.getTextContent(comments[comments.length - 1]),
          'The Polymer Project Authors');
    });
  });

  suite('Constructors', () => {

    test('text node', () => {
      const node = dom5.constructors.text('test');
      assert.isTrue(dom5.isTextNode(node));
      const fn = dom5.predicates.hasTextValue('test');
      assert.equal(dom5.nodeWalk(node, fn), node);
    });

    test('comment node', () => {
      const node = dom5.constructors.comment('test');
      assert.isTrue(dom5.isCommentNode(node));
      const fn = dom5.predicates.hasTextValue('test');
      assert.equal(dom5.nodeWalk(node, fn), node);
    });

    test('element', () => {
      const node = dom5.constructors.element('div');
      assert.isTrue(dom5.isElement(node));
      const fn = dom5.predicates.hasTagName('div');
      assert.equal(dom5.query(node, fn), node);
    });
  });

  suite('Text Normalization', () => {
    const con = dom5.constructors;

    test('normalizing text nodes or comment nodes is a noop', () => {
      const tn = con.text('test');
      const cn = con.comment('test2');

      dom5.normalize(tn);
      dom5.normalize(cn);
      assert.equal(tn, tn);
      assert.equal(cn, cn);
    });

    test('an element\'s child text nodes are merged', () => {
      const div = con.element('div');
      const tn1 = con.text('foo');
      const tn2 = con.text('bar');
      dom5.append(div, tn1);
      dom5.append(div, tn2);

      const expected = dom5.getTextContent(div);
      assert.equal(expected, 'foobar');
      dom5.normalize(div);
      const actual = dom5.getTextContent(div);

      assert.equal(actual, expected);
      assert.equal(div.childNodes!.length, 1);
    });

    test('only text node ranges are merged', () => {
      const div = con.element('div');
      const tn1 = con.text('foo');
      const tn2 = con.text('bar');
      const cn = con.comment('combobreaker');
      const tn3 = con.text('quux');
      dom5.append(div, tn1);
      dom5.append(div, tn2);
      dom5.append(div, cn);
      dom5.append(div, tn3);

      const expected = dom5.getTextContent(div);
      assert.equal(expected, 'foobarquux');
      dom5.normalize(div);
      const actual = dom5.getTextContent(div);

      assert.equal(actual, expected);
      assert.equal(div.childNodes!.length, 3);
      assert.equal(dom5.getTextContent(div.childNodes![0]), 'foobar');
      assert.equal(dom5.getTextContent(div.childNodes![1]), 'combobreaker');
      assert.equal(dom5.getTextContent(div.childNodes![2]), 'quux');
    });

    test('empty text nodes are removed', () => {
      const div = con.element('div');
      const tn = con.text('');
      dom5.append(div, tn);

      assert.equal(div.childNodes!.length, 1);
      dom5.normalize(div);
      assert.equal(div.childNodes!.length, 0);
    });

    test('elements are recursively normalized', () => {
      const div = con.element('div');
      const tn1 = con.text('foo');
      const space = con.text('');
      dom5.append(div, tn1);
      dom5.append(div, space);
      const span = con.element('span');
      const tn2 = con.text('bar');
      const tn3 = con.text('baz');
      dom5.append(span, tn2);
      dom5.append(span, tn3);
      dom5.append(div, span);

      assert.equal(dom5.getTextContent(div), 'foobarbaz');

      dom5.normalize(div);

      assert.equal(div.childNodes!.length, 2);
      assert.equal(span.childNodes!.length, 1);
    });

    test('document can be normalized', () => {
      const doc = parse5.parse('<!DOCTYPE html>');
      const body = doc.childNodes![1].childNodes![1];
      const div = con.element('div');
      const tn1 = con.text('foo');
      const space = con.text('');
      dom5.append(div, tn1);
      dom5.append(div, space);
      const span = con.element('span');
      const tn2 = con.text('bar');
      const tn3 = con.text('baz');
      dom5.append(span, tn2);
      dom5.append(span, tn3);
      dom5.append(div, span);
      dom5.append(body, div);

      assert.equal(dom5.getTextContent(doc), 'foobarbaz');
      dom5.normalize(doc);
      assert.equal(dom5.getTextContent(doc), 'foobarbaz');

      assert.equal(div.childNodes!.length, 2);
      assert.equal(span.childNodes!.length, 1);
    });
  });

});
