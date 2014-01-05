var path = require('path')
  , util = require('./mochaIntellijUtil');

function inherit(child, parent) {
  function F() {
    this.constructor = child;
  }

  F.prototype = parent.prototype;
  child.prototype = new F();
  return child;
}


function Tree(write) {
  this.write = write;
  this.root = new TestSuiteNode(this, 0, null, 'hidden root', null, null);
  this.nextId = 1;
}

/**
 * Node class is a base class for TestSuiteNode and TestNode classes.
 *
 * @param {Tree} tree test tree
 * @param {Number} id this node ID. It should be unique among all node IDs that belong to the same tree.
 * @param {Node} parentNode parent node
 * @param {String} name node name (it could be a suite/spec name)
 * @param {String} type node type (e.g. 'config', 'browser')
 * @param {String} locationPath string that is used by IDE to navigate to the definition of the node
 * @constructor
 */
function Node(tree, id, parentNode, name, type, locationPath) {
  this.tree = tree;
  this.id = id;
  this.parentNode = parentNode;
  this.name = name;
  this.type = type;
  this.locationPath = locationPath;
  this.isFinished = false;
}

Node.prototype.getExtraFinishMessageParameters = function () {
  return null;
};

Node.prototype.finishIfStarted = function () {
  if (!this.isFinished) {
    for (var i = 0; i < this.children.length; i++) {
      this.children[i].finishIfStarted();
    }
    this.writeFinishMessage();
    this.isFinished = true;
  }
};

Node.prototype.writeStartMessage = function () {
  var text = this.getStartMessage();
  this.tree.write(text);
  this.tree.write('\n');
};

Node.prototype.writeFinishMessage = function () {
  var text = this.getFinishMessage();
  this.tree.write(text);
  this.tree.write('\n');
  this.isFinished = true;
};

Node.prototype.getStartMessage = function () {
  var text = "##teamcity[";
  text += this.getStartCommandName();
  text += " nodeId='" + this.id;
  var parentNodeId = this.parentNode ? this.parentNode.id : 0;
  text += "' parentNodeId='" + parentNodeId;
  text += "' name='" + util.attributeValueEscape(this.name);
  if (this.type != null) {
    text += "' nodeType='" + this.type;
    if (this.locationPath != null) {
      text += "' locationHint='" + util.attributeValueEscape(this.type + '://' + this.locationPath);
    }
  }
  text += "']";
  return text;
};

Node.prototype.getFinishMessage = function () {
  var text = '##teamcity[' + this.getFinishCommandName();
  text += " nodeId='" + this.id + "'";
  var extraParameters = this.getExtraFinishMessageParameters();
  if (extraParameters) {
    text += extraParameters;
  }
  text += ']';
  return text;
};

/**
 * TestSuiteNode child of Node class. Represents a suite node.
 *
 * @param {Tree} tree test tree
 * @param {Number} id this node's ID. It should be unique among all node IDs that belong to the same tree.
 * @param {TestSuiteNode} parentNode parent node
 * @param {String} name node name (e.g. config file name / browser name / suite name)
 * @param {String} type node type (e.g. 'config', 'browser')
 * @param {String} locationPath navigation info
 * @constructor
 */
function TestSuiteNode(tree, id, parentNode, name, type, locationPath) {
  Node.call(this, tree, id, parentNode, name, type, locationPath);
  this.children = [];
  this.lookupMap = {};
}

inherit(TestSuiteNode, Node);

/**
 * Returns child node by its name.
 * @param childName
 * @returns {?Node} child node (null, if no child node with such name found)
 */
TestSuiteNode.prototype.findChildNodeByName = function(childName) {
  if (Object.prototype.hasOwnProperty.call(this.lookupMap, childName)) {
    return this.lookupMap[childName];
  }
  return null;
};

TestSuiteNode.prototype.getStartCommandName = function () {
  return 'testSuiteStarted';
};

TestSuiteNode.prototype.getFinishCommandName = function () {
  return 'testSuiteFinished';
};

/**
 *
 * @param {String} childName node name (e.g. browser name / suite name / spec name)
 * @param {Boolean} isChildSuite true if child node can have children
 * @param {String} nodeType child node type (e.g. 'config', 'browser')
 * @param {String} locationPath navigation info
 * @returns {TestSuiteNode | TestNode}
 */
TestSuiteNode.prototype.addChild = function (childName, isChildSuite, nodeType, locationPath) {
  if (this.isFinished) {
    throw Error('Child node could be created for finished node!');
  }
  var childId = this.tree.nextId++;
  var child;
  if (isChildSuite) {
    child = new TestSuiteNode(this.tree, childId, this, childName, nodeType, locationPath);
  }
  else {
    child = new TestNode(this.tree, childId, this, childName, nodeType, locationPath);
  }
  this.children.push(child);
  this.lookupMap[childName] = child;
  return child;
};


/**
 * TestNode class that represents a spec node.
 *
 * @param {Tree} tree test tree
 * @param {Number} id this node ID. It should be unique among all node IDs that belong to the same tree.
 * @param {TestSuiteNode} parentNode parent node
 * @param {String} name node name (spec name)
 * @param {String} type node type (e.g. 'config', 'browser')
 * @param {String} locationPath navigation info
 * @constructor
 */
function TestNode(tree, id, parentNode, name, type, locationPath) {
  Node.call(this, tree, id, parentNode, name, type, locationPath);
}

inherit(TestNode, Node);

/**
 * @param {Number} status test status
 * 0 = success
 * 1 = skipped
 * 2 = failed
 * 3 = error
 * @param {Number} duration test duration is ms
 * @param {String} failureMsg
 * @param failureDetails {String} stack trace
 * @param actualStr {String} actual value
 * @param expectedStr {String} expected value
 */
TestNode.prototype.setStatus = function (status, duration, failureMsg, failureDetails, actualStr, expectedStr) {
  this.status = status;
  this.duration = duration;
  this.failureMsg = failureMsg;
  this.failureDetails = failureDetails;
  this.actualStr = actualStr;
  this.expectedStr = expectedStr;
  if (this.status === 1 && !this.failureMsg) {
    this.failureMsg = 'Pending test \'' + this.name + '\'';
  }
};

TestNode.prototype.getStartCommandName = function () {
  return 'testStarted';
};

TestNode.prototype.getFinishCommandName = function () {
  switch (this.status) {
    case 0:
      return 'testFinished';
    case 1:
      return 'testIgnored';
    case 2:
      return 'testFailed';
    case 3:
      return 'testFailed';
    default:
      throw Error("Unexpected status: " + JSON.stringify(this.status));
  }
};

TestNode.prototype.getExtraFinishMessageParameters = function () {
  var params = '';
  if (typeof this.duration === 'number') {
    params += " duration='" + this.duration + "'";
  }
  if (this.status === 3) {
    params += " error='yes'";
  }
  if (util.isString(this.failureMsg)) {
    params += " message='" + util.attributeValueEscape(this.failureMsg) + "'";
  }
  if (util.isString(this.failureDetails)) {
    params += " details='" + util.attributeValueEscape(this.failureDetails) + "'";
  }
  if (util.isString(this.actualStr)) {
    params += " actual='" + util.attributeValueEscape(this.actualStr) + "'";
  }
  if (util.isString(this.expectedStr)) {
    params += " expected='" + util.attributeValueEscape(this.expectedStr) + "'";
  }
  return params.length === 0 ? null : params;
};


module.exports = Tree;
