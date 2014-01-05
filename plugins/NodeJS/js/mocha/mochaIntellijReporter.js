var Tree = require('./mochaIntellijTree')
  , util = require('./mochaIntellijUtil')
  , treeUtil = require('./mochaTreeUtil')
  , fs = require('fs')
  , Base = require('./mochaBaseReporter');

function getOrCreateSuiteNode(tree, test) {
  var suites = [];
  var suite = test.parent;
  while (suite != null && !suite.root) {
    suites.push(suite);
    suite = suite.parent;
  }
  suites.reverse();
  var parentNode = tree.root, suiteId;
  for (suiteId = 0; suiteId < suites.length; suiteId++) {
    suite = suites[suiteId];
    var suiteName = suite.title;
    var childNode = parentNode.findChildNodeByName(suiteName);
    if (!childNode) {
      var locationPath = getLocationPath(parentNode, suiteName);
      childNode = parentNode.addChild(suiteName, true, 'suite', locationPath);
      childNode.writeStartMessage();
    }
    parentNode = childNode;
  }
  return parentNode;
}

function getLocationPath(parentNode, childName) {
  var names = []
    , node = parentNode
    , root = node.tree.root;
  while (node !== root) {
    names.push(node.name);
    node = node.parentNode;
  }
  names.reverse();
  names.push(childName);
  return util.joinList(names, 0, names.length, '.');
}

function stringify(obj) {
  if (obj instanceof RegExp) return obj.toString();
  return JSON.stringify(obj, null, 2);
}

function extractErrInfo(err) {
  var message = err.message || ''
    , stack = err.stack;
  if (!util.isString(stack) || stack.trim().length == 0) {
    return {
      message: message
    }
  }
  var index = stack.indexOf(message);
  if (index >= 0) {
    message = stack.slice(0, index + message.length);
    stack = stack.slice(message.length);
    var nl = '\n';
    if (stack.indexOf(nl) === 0) {
      stack = stack.substring(nl.length);
    }
  }
  return {
    message : message,
    stack : stack
  }
}

function createTestNode(suiteNode, test, err, theSecondPassThatHeals) {
  var locationPath = getLocationPath(suiteNode, test.title);
  var testNode;
  if (theSecondPassThatHeals) {
    testNode = suiteNode.findChildNodeByName(test.title);
    if (!testNode) {
      testNode = suiteNode.addChild(test.title, false, 'test', locationPath);
      testNode.writeStartMessage();
      if (test.sync) {
        testNode.setStatus(3, test.duration, '[Internal error] Mocha API failed to report the test status to IDE', null, null, null);
      }
      else {
        testNode.setStatus(2, test.duration, 'Looks like an async test callback is not called', null, null, null);
      }
      testNode.writeFinishMessage();
    }
    return;
  }
  testNode = suiteNode.addChild(test.title, false, 'test', locationPath);
  testNode.writeStartMessage();
  if (err) {
    var errInfo = extractErrInfo(err);
    var actualStr, expectedStr;
    if (typeof err.actual != 'undefined' && typeof err.expected != 'undefined') {
      actualStr = stringify(err.actual);
      expectedStr = stringify(err.expected);
      if (!util.isString(actualStr) || !util.isString(expectedStr)) {
        actualStr = null;
        expectedStr = null;
      }
    }
    testNode.setStatus(2, test.duration, errInfo.message, errInfo.stack, actualStr, expectedStr);
  }
  else {
    var status = test.pending ? 1 : 0;
    testNode.setStatus(status, test.duration, null, null, null, null);
  }
  testNode.writeFinishMessage();
}

function IntellijReporter(runner) {
  if (Base != null) {
    Base.call(this, runner);
  }

  var executeSafely = util.executeSafely;
  var tree;

  runner.on('start', function () {
    executeSafely(function () {
      tree = new Tree(function (str) {
        util.writeSync(process.stdout.fd, str);
      });
      tree.write('##teamcity[enteredTheMatrix]\n');
    });
  });

  runner.on('pending', function (test) {
    executeSafely(function () {
      var suiteNode = getOrCreateSuiteNode(tree, test);
      createTestNode(suiteNode, test, null, false);
    });
  });

  runner.on('pass', function (test) {
    executeSafely(function () {
      var suiteNode = getOrCreateSuiteNode(tree, test);
      createTestNode(suiteNode, test, null, false);
    });
  });

  runner.on('fail', function (test, err) {
    executeSafely(function () {
      var suiteNode = getOrCreateSuiteNode(tree, test);
      createTestNode(suiteNode, test, err, false);
    });
  });

  runner.on('end', function(){
    executeSafely(function () {
      treeUtil.finishTree(tree);
      tree = null;
    });
  });

  process.on('exit', function () {
    if (tree != null) {
      executeSafely(function () {
        treeUtil.forEachTest(runner, tree, function (test) {
          var suiteNode = getOrCreateSuiteNode(tree, test);
          createTestNode(suiteNode, test, null, true);
        });
        treeUtil.finishTree(tree);
        tree = null;
      });
    }
  });
}

module.exports = IntellijReporter;
