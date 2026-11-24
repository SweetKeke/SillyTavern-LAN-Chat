// SillyTavern owns the slide animation and icon state for inline drawers.
export function drawer(parent, text, expanded = false) {
    const root = document.createElement('div');
    root.className = 'inline-drawer';
    const header = document.createElement('div');
    header.className = 'inline-drawer-toggle inline-drawer-header';
    header.tabIndex = 0;
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', String(expanded));
    const title = document.createElement('b');
    title.textContent = text;
    const icon = document.createElement('div');
    icon.className = 'inline-drawer-icon fa-solid ' + (expanded ? 'fa-circle-chevron-up up' : 'fa-circle-chevron-down down');
    icon.setAttribute('aria-hidden', 'true');
    const content = document.createElement('div');
    content.className = 'inline-drawer-content';
    if (expanded) content.style.display = 'block';
    header.append(title, icon);
    root.append(header, content);
    parent.append(root);
    header.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); }
    };
    jQuery(root).on('inline-drawer-toggle', e => {
        if (e.target === root) header.setAttribute('aria-expanded', String(icon.classList.contains('up')));
    });
    return { root, title, header, content };
}

export function onOpen(view, fn) {
    jQuery(view.root).on('inline-drawer-toggle', e => {
        if (e.target === view.root && view.header.getAttribute('aria-expanded') === 'true') fn();
    });
}

export function menuButton(text, glyph) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'menu_button menu_button_icon';
    const label = document.createElement('small');
    label.textContent = text;
    if (glyph) {
        const icon = document.createElement('i');
        icon.className = 'fa-solid ' + glyph;
        icon.setAttribute('aria-hidden','true');
        el.append(icon);
    }
    el.append(label);
    return el;
}

