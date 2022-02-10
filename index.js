import {Emitter} from "./emitter";

/**
 * @typedef {object} TreeData
 * @property {string|object} [value]
 * @property {TreeData[]} children=[]
 * @property {boolean} [open=false]
 * @property {boolean} [selected=false]
 */

const classes = ['enter', 'leave', 'enter-to', 'leave-to', 'enter-active', 'leave-active'];

/**
 * Add animation classes, remove them when transition ends
 * @param {HTMLElement} dom
 * @param {boolean} state
 * @return {Promise<HTMLElement>}
 */
function animate(dom, state) {
  const evt = state ? 'enter' : 'leave';
  return new Promise((resolve) => {
    dom.classList.remove(...classes);
    addEventListener(
      dom,
      'transitionend',
      () => dom.classList.remove(...classes),
      {once: true, capture: false},
    );
    dom.classList.add(`${evt}-active`, evt);
    requestAnimationFrame(() => {
      dom.classList.remove(evt);
      dom.classList.add(`${evt}-to`);
      resolve(dom);
    });
  });
}

/**
 * Create HTML dom element
 * @param {string} tag
 * @return {*}
 */
function createElement(tag) {
  return document.createElement(tag);
}

/**
 * Add Event to element
 * @param {HTMLElement} el
 * @param {string} evt
 * @param {function(Event)} fn
 * @param {boolean|object} opt
 * @return {void}
 */
function addEventListener(el, evt, fn, opt = false) {
  el?.addEventListener(evt, fn, opt);
}

/**
 * @param {*} data
 * @return {{children: array, value}}
 */
function cleanData(data) {
  if (data instanceof Map) return {children: [...data.values()]};
  if (data instanceof Set) return {children: [...data.values()]};
  if (Array.isArray(data)) return {children: data, value: null};
  if (typeof data === 'object') return {...data};
  if (typeof data === 'function') return {value: null, children: []};

  return {value: data, children: []};
}

/**
 * @param {*} data
 * @return {array}
 */
function cleanChildren(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (data instanceof Map) return [...data.values()];
  if (data instanceof Set) return [...data];
  if (typeof data[Symbol.iterator] === 'function') return [...data];
  return [data];
}

/**
 * Create dom for Tree if dom is null
 * @param {Tree} tree
 * @param {HTMLElement} dom
 * @return {HTMLElement}
 */
function makeDom(tree, dom) {
  if (dom) return dom;
  const {base_class} = tree.options;
  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    tree.toggle();
  };
  const cls = (name) => `${base_class}__${name}`;

  const $root = createElement('div');
  const $toggle = createElement('div');
  const $value = createElement('span');
  const $children = createElement('div');

  $root.className = base_class;
  $toggle.className = cls('toggle');
  $value.className = cls('value');
  $children.className = cls('children');
  $root.replaceChildren($toggle, $value, $children);

  if (tree.options.selectable) {
    addEventListener($value, 'click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tree.selected = tree.max === 1 ? 1 : !tree.selected;
    });
  }
  addEventListener($value, 'dblclick', toggle);
  addEventListener($toggle, 'click', toggle);

  updateDOM(tree, $root);
  return $root;
}

/**
 * Update attributes, and content of tree DOM
 * @param {Tree} tree
 * @param {HTMLElement} $root
 * @param {number} open
 * @return {boolean}
 */
function updateDOM(tree, $root, open = 0) {
  const {state, selected, value, children, level, index, searched, options: {render}} = tree;
  if (!$root) return false;
  const [$toggle, $value, $children] = $root.children;
  const attrs = {state, selected, searched, level, index, children: children.length};

  if (state) $children.replaceChildren(...children.map(({dom}) => dom));
  if (open) animate($children, state);
  attr($root, attrs);
  attr($children, attrs);
  attr($toggle, attrs);
  attr($value, attrs);
  $value.replaceChildren(render ? render(value, this) : (value ?? ''));

  return true;
}

/**
 * Find the root parent
 * @param {Tree}tree
 * @return {Tree}
 */
function getRoot(tree) {
  while (tree.parent) tree = tree.parent;
  return tree;
}

/**
 * Set attributes on element
 * @param {HTMLElement} el
 * @param {object} attrs
 */
function attr(el, attrs) {
  Object.entries(attrs).forEach(([key, val]) => el.setAttribute(key, val));
}


export class Tree extends Emitter {
  /**
   * @param {TreeData|TreeData[]} data
   * @param {Tree} [parent]
   * @param {number} [index]
   */
  constructor(data, parent = null, index = null) {
    super();

    const options = cleanData(data);

    options.base_class = options.base_class ?? 'pm-tree';

    let level = parent ? parent.level + 1 : 0;
    let {value} = options;
    let selected = options.selected ? 1 : 0;
    let state = (options.open ?? options.state) ? 1 : 0;
    let children;
    let dom = null;
    const max = options.max ?? 1;
    let searched = 0;
    let parent_ref = parent ? new WeakRef(parent) : null;

    if (!parent && !value) state = 1;

    const update = (open) => updateDOM(this, dom, open);
    const setChildren = (data, start) => {
      const {options} = this;
      children = cleanChildren(data).map((item, i) => new Tree({
        ...options,
        selectable: item.selectable ?? options?.selectable,
        children: [],
        value: null,
        ...cleanData(item),
      }, this, i));
      if (!start) {
        this.emit('change', this);
        if (!level) this.root.emit('change', this);
      }
      update();
    };

    Object.defineProperties(this, {
      max: {get: () => (parent ? this.root.max : max)},
      options: {value: options},
      level: {get: () => level},
      async: {value: false},
      parent: {
        get: () => parent_ref?.deref() ?? null,
        set: (val) => {
          const old_lvl = level;
          parent_ref = new WeakRef(val);
          level = val ? val.level + 1 : 0;
          // update child levels if level changed
          if (level === old_lvl) return;
          children.forEach((child) => child.parent = this);
          update();
        },
      },
      searched: {
        get: () => (searched ?? 0),
        set: (val) => {
          if (val === searched) return;
          searched = val;
          update();
        },
      },
      index: {
        get: () => (index ?? 0),
        set: (val) => {
          if (val === index) return;
          index = val;
          update();
        },
      },
      value: {
        get: () => value,
        set: (new_val) => {
          new_val = new_val ? 1 : 0;
          if (new_val === value) return;
          value = new_val;
          update();
        },
      },
      selected: {
        get: () => selected,
        set: (new_sel) => {
          new_sel = new_sel ? 1 : 0;
          if (new_sel === selected) return;
          selected = new_sel;
          this.emit(selected ? 'selected' : 'deslected', this);
          update();
          if (this.max === 1 && new_sel) {
            this.root
              .find((child) => this !== child && child.selected)
              .then((found) => {
                if (found) found.selected = 0;
              });
          }
        },
      },
      state: {
        get: () => state,
        set: (val) => {
          val = val ? 1 : 0;

          // Cant close root if it has no value
          if (!parent && !value) return;

          if (val === state) return;
          state = val;
          this.emit('state', state, this);
          this.emit(state ? 'open' : 'close', this);
          update(1);
        },
      },
      children: {
        get: () => {
          if (!children) setChildren(options.children, 1);
          return children;
        },
        set: (data) => setChildren(data),
      },
      rendered: {get: () => !!dom},
      dom: {get: () => dom = makeDom(this, dom, options.base_class)},
      root: {get: () => getRoot(this)},
    });

    // hook up events
    Object.entries(options).forEach(([evt, fn]) => {
      if (fn instanceof Function && /^on.+/.test(evt)) this.on(evt.slice(2), fn);
    });
  }

  /**
   * Add tree node to tree at index {pos}
   * @param {Tree|TreeData[]|TreeData} data
   * @param {number} [pos]
   */
  add(data, pos = Number.POSITIVE_INFINITY) {
    const {children, rendered, root} = this;
    pos = Math.min(children.length, Math.max(pos, 0));
    const new_child = data instanceof Tree ? data : new Tree(data, this, pos);
    children.splice(pos, 0, new_child);

    if (rendered) this.dom.insertBefore(new_child.dom, children[pos + 1]?.dom);

    // re-index and updateDDM siblings of the new child
    for (let i = pos, child; (child = children[i]); i++) child.index = i;

    this.emit('change', this);
    if (this !== root) root.emit('change', this);
  }

  /**
   * Removes {pos} from Tree, index if pos is a number
   * @param {number|Tree} pos
   * @throws {RangeError}
   */
  remove(pos) {
    const {children, root} = this;
    if (pos instanceof Tree) pos = children.indexOf(pos);
    if (pos < 0 || pos >= children.length) throw RangeError('Index out of bounde');
    const [child] = children.splice(pos, 1);

    // re-index siblings of the removed
    for (let i = pos; i < children.length; i++) children[i].index = i;

    child.emit('removed');
    this.emit('change', this);
    root.emit('change', this);

    // clean up + release memory
    if (child.rendered) child.dom.remove();
    child.parent = null;
    child.index = 0;

    children.forEach((child, index) => child.index = index);
  }

  /**
   * Compares two Tree nodes according to the sort order. (level, then index)
   * @param {Tree} other
   * @return {number}
   */
  compare(other) {
    return this.level - other.level || this.index - other.index;
  }

  /**
   * @param {string|function:boolean} filter
   * @return {Promise<string[]|null>}
   */
  async search(filter) {
    const fn = filter instanceof Function ? filter : (value) => filter === value;
    const list = [];
    return this.forEach((child) => {
      child.searched = fn(child.value);
      if (!child.searched) return;
      list.push(child);
      child.parent?.open();
    }).then(() => list);
  }

  /**
   * @param {function(child: Tree, parent: Tree, index: number): boolean|void} fn
   * @param {Tree} parent
   * @param {number} index
   * @return {Promise}
   */
  async forEach(fn, parent = null, index = 0) {
    if (parent && !(await fn(this, parent, index))) return;
    return Promise
      .all(this.children.map((child, index) => child.forEach(fn, this, index)))
      .then(() => null);
  }

  /**
   * @param {string|function(Tree): boolean} fn
   * @return {Promise<Tree|null>}
   */
  async find(fn) {
    const search = fn instanceof Function ? fn : (value) => fn === value;
    let found = null;
    return this
      .forEach((child) => {
        if (!found && search(child)) found = child;
        return !found;
      })
      .then(() => found);
  }

  /**
   * Get a data representation of the tree
   * @return {TreeData[]}
   */
  get data() {
    return this.children.map(({value, data: children}) => ({value, children}));
  }

  /**
   * @return {TreeData[]}
   */
  set data(new_data) {
    this.children = new_data;
  }

  /**
   * Opens tree node
   */
  open() {
    this.state = 1;
    this.parent?.open();
  }

  /**
   * Closes tree node
   */
  close() {
    this.state = 0;
  }

  /**
   * Toggles open/close
   * @return {number}
   */
  toggle() {
    this[this.state ? 'close' : 'open']();
    return this.state;
  }

  /**
   * Collpase all tree nodes
   */
  collapseAll() {
    this.close();
    this.forEach((child) => child.close());
  }

  /**
   * Expand all tree nodes
   */
  expandAll() {
    this.open();
    this.forEach((child) => child.open());
  }

  /**
   * @return {TreeData[]}
   */
  toJSON() {
    return this.data;
  }
}


/**
 * Create a tree structure
 * @param {TreeData|TreeData[]} data
 * @return{Tree}
 */
export function tree(data) {
  return new Tree(data);
}

export default tree;
