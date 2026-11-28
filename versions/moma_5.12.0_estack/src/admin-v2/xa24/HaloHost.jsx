import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createApp, defineComponent, h, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import Haloe from '@cmss-bfs/haloe/dist/es/index.js';

const PortalTarget = defineComponent({
  props: ['portalKey', 'tag', 'accept', 'register'],
  setup(props) {
    const element = shallowRef(null);
    let mounted;
    onMounted(() => {
      const node = element.value;
      if (props.accept && !props.accept(node)) return;
      mounted = node;
      props.register(props.portalKey, node, true);
    });
    onBeforeUnmount(() => {
      if (mounted) props.register(props.portalKey, mounted, false);
    });
    return () => h(props.tag, { ref: element, style: { display: 'contents' } });
  },
});

export default function HaloHost({
  as: Host = 'div', hostRef, component, vueProps, slots, slotTags, children, renderVue, portals, ...attributes
}) {
  const node = useRef(null);
  const mounted = useRef(false);
  const [targets, setTargets] = useState(() => new Map());
  const [snapshot] = useState(() => shallowRef());
  const connectHost = useCallback(element => {
    node.current = element;
    if (typeof hostRef === 'function') return hostRef(element);
    if (hostRef) hostRef.current = element;
  }, [hostRef]);

  const contents = renderVue ? portals : new Map(Object.entries({ ...slots, ...(children !== undefined && { default: children }) }));
  useLayoutEffect(() => {
    const slotNames = Object.entries({ ...slots, ...(children !== undefined && { default: children }) })
      .filter(([, content]) => content != null && content !== false);
    snapshot.value = target => renderVue ? renderVue(target) : h(component, vueProps,
      Object.fromEntries(slotNames.map(([name]) => [name, () => target(name, slotTags?.[name] ?? Host)])));
  }, [Host, children, component, renderVue, slots, slotTags, snapshot, vueProps]);

  useLayoutEffect(() => {
    mounted.current = true;
    setTargets(new Map());
    const register = (key, target, add) => {
      if (!mounted.current) return;
      setTargets(current => {
        const match = current.get(key) === target;
        if ((add && match) || (!add && !match)) return current;
        const next = new Map(current);
        if (add) next.set(key, target);
        else next.delete(key);
        return next;
      });
    };
    const target = (key, tag = 'span', accept) => h(PortalTarget, { key, portalKey: key, tag, accept, register });
    const app = createApp({ render: () => snapshot.value?.(target) });
    app.use(Haloe, { transfer: false });
    app.mount(node.current);
    return () => {
      mounted.current = false;
      app.unmount();
    };
  }, [Host, snapshot]);

  return <>
    <Host {...attributes} ref={connectHost}/>
    {contents && [...targets].map(([key, target]) => contents.has(key)
      ? createPortal(contents.get(key), target, key) : null)}
  </>;
}
