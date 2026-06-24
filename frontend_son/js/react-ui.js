/**
 * Small React components mounted into existing HTML pages (CDN, no build step).
 * Exposed as window.ResumeAI for vanilla JS integration.
 */
(function (global) {
    var h = React.createElement;
    var useState = React.useState;

    var roots = new Map();
    var userBadgeRoot = null;
    var suggestionListProps = new Map();

    function getOrCreateRoot(container) {
        if (!container) return null;
        var root = roots.get(container);
        if (!root) {
            root = ReactDOM.createRoot(container);
            roots.set(container, root);
        }
        return root;
    }

    // ── PasswordInput ─────────────────────────────────────────────
    function PasswordInput(props) {
        var id = props.id;
        var name = props.name;
        var placeholder = props.placeholder;
        var minLength = props.minLength;
        var autoComplete = props.autoComplete;
        var required = props.required !== false;
        var showState = useState(false);
        var show = showState[0];
        var setShow = showState[1];

        return h(
            'div',
            { className: 'input-shell' },
            h(
                'span',
                { className: 'icon-left' },
                h(
                    'svg',
                    { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
                    h('rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }),
                    h('path', { d: 'M7 11V7a5 5 0 0110 0v4' })
                )
            ),
            h('input', {
                type: show ? 'text' : 'password',
                id: id,
                name: name || id,
                placeholder: placeholder,
                autoComplete: autoComplete,
                required: required,
                minLength: minLength || undefined
            }),
            h(
                'button',
                {
                    type: 'button',
                    className: 'toggle-pass',
                    'aria-label': show ? 'Hide password' : 'Show password',
                    onClick: function () {
                        setShow(!show);
                    }
                },
                h(
                    'svg',
                    {
                        width: 18,
                        height: 18,
                        viewBox: '0 0 24 24',
                        fill: 'none',
                        stroke: 'currentColor',
                        strokeWidth: 2,
                        style: { display: show ? 'none' : '' }
                    },
                    h('path', { d: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z' }),
                    h('circle', { cx: 12, cy: 12, r: 3 })
                ),
                h(
                    'svg',
                    {
                        width: 18,
                        height: 18,
                        viewBox: '0 0 24 24',
                        fill: 'none',
                        stroke: 'currentColor',
                        strokeWidth: 2,
                        style: { display: show ? '' : 'none' }
                    },
                    h('path', {
                        d: 'M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24'
                    }),
                    h('line', { x1: 1, y1: 1, x2: 23, y2: 23 })
                )
            )
        );
    }

    // ── UserBadge ─────────────────────────────────────────────────
    function UserBadge(props) {
        var email = props.email || 'you@example.com';
        var display = email.length > 28 ? email.slice(0, 25) + '…' : email;
        var initial = email.trim() ? email.trim().charAt(0).toUpperCase() : 'U';

        return h(React.Fragment, null,
            h('div', { className: 'user-email', id: 'user-email' }, display),
            h('div', { className: 'user-avatar-rail', id: 'user-avatar-rail', 'aria-hidden': true }, initial)
        );
    }

    // ── FitScoreCircle ────────────────────────────────────────────
    function FitScoreCircle(props) {
        var percent = props.percent;
        var label = props.label || 'Fit Score';
        var marker = props.marker;
        var r = 70;
        var c = 2 * Math.PI * r;
        var pct =
            percent == null || percent === ''
                ? null
                : Math.round(Math.max(0, Math.min(100, Number(percent) || 0)));
        var offset = pct == null ? c : c * (1 - pct / 100);
        var display = pct == null ? '—' : String(pct) + '%';

        return h(
            'div',
            { className: 'fit-wrap' },
            h(
                'div',
                { className: 'circular-progress' },
                h(
                    'svg',
                    { width: 180, height: 180, viewBox: '0 0 180 180' },
                    h('circle', { className: 'bg-circle', cx: 90, cy: 90, r: r }),
                    h('circle', {
                        className: 'progress-circle',
                        cx: 90,
                        cy: 90,
                        r: r,
                        'data-progress': marker || undefined,
                        style: { strokeDasharray: String(c), strokeDashoffset: String(offset) }
                    })
                ),
                h(
                    'div',
                    { className: 'score-text' },
                    h('div', { className: 'score-number', 'data-score-num': true }, display),
                    h('div', { className: 'score-label' }, label)
                )
            )
        );
    }

    // ── SuggestionCard ────────────────────────────────────────────
    function SuggestionCard(props) {
        var suggestion = props.suggestion || {};
        var checked = props.checked !== false;

        return h(
            'div',
            { className: 'embed-improve-block' },
            h(
                'div',
                { className: 'embed-improve-head' },
                h(
                    'p',
                    { className: 'embed-improve-note' },
                    h('strong', null, suggestion.title || ''),
                    h('br'),
                    suggestion.reason || ''
                ),
                h(
                    'label',
                    { style: { display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.875rem' } },
                    h('input', {
                        type: 'checkbox',
                        className: 'suggestion-toggle',
                        'data-suggestion-id': suggestion.id,
                        defaultChecked: checked
                    }),
                    ' Apply'
                )
            ),
            h(
                'div',
                { className: 'embed-diff' },
                h('div', { className: 'embed-diff-after' }, suggestion.change || '')
            )
        );
    }

    function SuggestionList(props) {
        var suggestions = props.suggestions || [];
        var selections = props.selections || {};

        return h(
            React.Fragment,
            null,
            suggestions.map(function (s) {
                return h(SuggestionCard, {
                    key: s.id,
                    suggestion: s,
                    checked: selections[s.id] !== false
                });
            })
        );
    }

    // ── Public mount API ──────────────────────────────────────────
    function mountPasswordInput(container, props) {
        var root = getOrCreateRoot(container);
        if (root) root.render(h(PasswordInput, props));
    }

    function mountUserBadge(container, props) {
        if (!container) return;
        if (!userBadgeRoot) {
            userBadgeRoot = ReactDOM.createRoot(container);
        }
        userBadgeRoot.render(h(UserBadge, props));
    }

    function updateUserBadge(email) {
        if (userBadgeRoot) {
            userBadgeRoot.render(h(UserBadge, { email: email }));
        }
    }

    function mountFitScore(container, props) {
        var root = getOrCreateRoot(container);
        if (root) root.render(h(FitScoreCircle, props));
    }

    function mountSuggestionList(container, props) {
        if (container) {
            suggestionListProps.set(container, props);
        }
        var root = getOrCreateRoot(container);
        if (root) {
            root.render(
                h(SuggestionList, {
                    key: props.selectionsKey != null ? String(props.selectionsKey) : 'default',
                    suggestions: props.suggestions,
                    selections: props.selections
                })
            );
        }
    }

    function setAllSuggestions(container, apply) {
        var props = suggestionListProps.get(container);
        if (!props || !container) return;
        var newSel = {};
        (props.suggestions || []).forEach(function (s) {
            newSel[s.id] = !!apply;
        });
        mountSuggestionList(container, {
            suggestions: props.suggestions,
            selections: newSel,
            selectionsKey: Date.now()
        });
    }

    function readSuggestionSelections(container) {
        if (!container) return [];
        var out = [];
        container.querySelectorAll('.suggestion-toggle').forEach(function (el) {
            out.push({
                id: el.getAttribute('data-suggestion-id'),
                apply: !!el.checked
            });
        });
        return out;
    }

    global.ResumeAI = {
        mountPasswordInput: mountPasswordInput,
        mountUserBadge: mountUserBadge,
        updateUserBadge: updateUserBadge,
        mountFitScore: mountFitScore,
        mountSuggestionList: mountSuggestionList,
        setAllSuggestions: setAllSuggestions,
        readSuggestionSelections: readSuggestionSelections
    };
})(typeof window !== 'undefined' ? window : this);
