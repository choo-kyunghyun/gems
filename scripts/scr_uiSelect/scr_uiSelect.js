function uiSelect(style = {}, select = {}, panel = {}, text = {}) {
  const items = select.items ?? [];
  let index = select.index ?? 0;
  const on_change = method(this, select.on_change ?? noop);

  const element = new UIElement(style)
    .addComponent(new UIPanel(panel))
    .addComponent(
      new UITrigger({
        block: true,
        on_click: () => {
          if (items.length <= 0) return;
          index = (index + 1) % items.length;
          on_change();
        },
      }),
    );

  element.insertChild(
    uiText(
      {},
      {
        ...text,
        text_ref: () => {
          if (items.length <= 0) return "";
          return items[index].name;
        },
      },
    ),
  );

  const elemAny = element;

  elemAny.insert_item = (name, value, idx = items.length) => {
    items.splice(idx, 0, { name, value });
    on_change();
    return element;
  };

  elemAny.get_name = () => {
    if (items.length <= 0) return "";
    return items[index].name;
  };

  elemAny.get_value = () => {
    if (items.length <= 0) return "";
    return items[index].value;
  };

  elemAny.set_index = (idx) => {
    index = clamp(idx, 0, items.length - 1);
    on_change();
    return element;
  };

  return element;
}
