mEditable = {
    _types: new Meteor.Collection(null),
    getTemplate: function (type) {
        var t = this._types.findOne({_id: type });
        if (!t)
            throw new Meteor.Error(500, 'Editable type ' + type + ' is not defined.');
        return Template[t.template];
    },
    getVal: function (type) {
        return this._types.findOne({_id: type }).getVal;
    },
    addType: function (type) {
        type._id = type.type;
        delete type.type;

        check(type, {
            _id: Match.Where(function (t) {
                check(t, String);
                return t !== '';
            }),
            getVal: Function,
            template: Match.Where(function (t) {
                return typeof t === 'object';
            })
        });
        // store only the template name
        type.template = type.template.kind.replace(/^Template_/, '');
        return this._types.insert(type);
    }
};

var m_editable = Template['m_editable_main'];
var POSSIBLE_POSITIONS = ['left', 'right', 'top', 'bottom'];
Template.m_editable.helpers({ 'settings': function () { return generateSettings(this); } });

m_editable.helpers({
    'displayVal':    function (v) { return typeof this.display === 'function' ? this.display(v) : v; },
    'value':         function () { return valueToText(this.value, this.source) || this.emptyText; },
    'editableEmpty': function () { return !valueToText(this.value, this.source) ? 'editable-empty' : '';},
    'inputTemplate': function () { return mEditable.getTemplate(this.type); }
//     can't get tmpl in this context else I'd do this:
//    'loading': function (a,b) {
//        return tmpl.Session.get('loading');
//    }
});

m_editable.events({
    'submit': function (e, tmpl) {
        var self = this;

        var val = mEditable.getVal(this.type)(tmpl.$('.editable-input'));

        if (typeof self.onsubmit === 'function') {
            if (self.async) {
                tmpl.Session.set('loading', true);
                this.onsubmit.call(this, val, function () {
                    tmpl.$('.m_editable-popup').trigger('hide');
                    doSavedTransition(tmpl);
                });
                return;
            }
            this.onsubmit.call(this, val);
        }
        tmpl.$('.m_editable-popup').trigger('hide');
        doSavedTransition(tmpl);
    },
    'click .editable-cancel': function (e, tmpl) {
        tmpl.$('.m_editable-popup').trigger('hide');
    },
    'submit .editableform': function (e) {
        e.preventDefault();
    },
    'click .popover-handle': function (e, tmpl) {
        e.stopPropagation();
        tmpl.$('.m_editable-popup').trigger(!tmpl.Session.get('popover-visible') ? 'show' : 'hide');
    },
    'hidden .m_editable-popup': function (e, tmpl) {
        tmpl.Session.set('loading', false);
    },
    'shown .m_editable-popup': function (e, tmpl) {
        tmpl.$('.editable-focus').first().focus();
    },
    'hide .m_editable-popup': function (e, tmpl) {
        if (tmpl.Session.equals('popover-visible', false)) {
            e.stopImmediatePropagation();
            return;
        }

        tmpl.Session.set('popover-visible', false);

        setTimeout(function () {
            $(e.target).trigger('hidden');
        }, 325); // 325 seems to be the magic number (for my desktop at least) so the user doesn't see the form show up again
    },
    'show .m_editable-popup': function (e, tmpl) {
        if (tmpl.Session.equals('popover-visible', true)) {
            e.stopImmediatePropagation();
            return;
        }
        tmpl.Session.set('popover-visible', true);
        setTimeout(function () {
            $(e.target).trigger('shown');
        }, 0);
    }
});

m_editable.rendered = function () {
    var self = this;
    var $popover = self.$('.m_editable-popup');

    self.Deps.autorun(function () {
        var loading = self.Session.get('loading');
        if (typeof loading === 'undefined')
            return;

        if (loading) {
            self.$('.editableform').hide();
            self.$('.editableform-loading').show();
        } else {
            self.$('.editableform-loading').hide();
            self.$('.editableform').show();
        }
    });

    self.Deps.autorun(function () {
        var visible = self.Session.get('popover-visible');
        self.Session.get('loading'); // changes the form size, so need to re-calculate location
        var settings = self.Session.get('settings');
        if (typeof visible === 'undefined') {
            return;
        }

        if (visible) {
            $popover.trigger('show');
            $popover.fadeIn();

            var placement = self.data.position,
                actualWidth = $popover[0].offsetWidth,
                actualHeight = $popover[0].offsetHeight,
                pos = $.fn.tooltip.Constructor.prototype.getPosition.call({ $element: $popover.siblings('.popover-handle') });
            var calculatedOffset = $.fn.tooltip.Constructor.prototype.getCalculatedOffset(placement, pos, actualWidth, actualHeight);

            $.fn.tooltip.Constructor.prototype.applyPlacement.call({
                tip: function () { return $popover; },
                replaceArrow: function (delta, dimension, position) { $popover.find('.arrow').css(position, delta ? (50 * (1 - delta / dimension) + '%') : ''); }
            }, calculatedOffset, placement);
        } else {
            $popover.trigger('hide');
            $popover.fadeOut();
        }
    });
};

Meteor.startup(function () {
    $(document).on('click.m_editable-popover-close', function (e) {
        $('.m_editable-popup:visible').each(function () {
            var $popover = $(this);
            if (!$popover.is(e.target) &&
                !$popover.siblings('.m_editable-popup-handle').is(e.target) &&
                $popover.has(e.target).length === 0 &&
                $popover.siblings('.m_editable-popup-handle').has(e.target).length === 0) {
                $popover.trigger('hide');
            }
        });
    });
});

function valueToText(val, source) {
    if (source && source.length) {
        _.each(source, function (s) {
            if (val.toString() === s.value.toString()) {
                val = s.text;
                return;
            }
        });
    }

    return val;
}

function generateSettings (settings) {
    if (POSSIBLE_POSITIONS.indexOf(settings.position) == -1)
        delete settings.position;
    if (!Template['m_editable_form_' + settings.type])
        delete settings.type;
    return _.extend({
        type: 'text',
        emptyText: 'Empty',
        async: false,
        showbuttons: true,
        onsubmit: null,
        value: null,
        position: 'left',
        title: null,
        placeholder: null,
    }, settings);
}

function doSavedTransition (tmpl) {
    var $e = tmpl.$('.popover-handle'),
        bgColor = $e.css('background-color');

    $e.css('background-color', '#FFFF80');
    setTimeout(function(){
        if(bgColor === 'transparent') {
            bgColor = '';
        }
        $e.css('background-color', bgColor);
        $e.addClass('editable-bg-transition');
        setTimeout(function(){
            $e.removeClass('editable-bg-transition');
        }, 1700);
    }, 10);
}

// Session & Deps stuff
m_editable.destroyed = function () { this.Session.destroyAll(); this.Deps.stopAll(); };
m_editable.created = function () {
    var self = this;

    self.Deps = {
        _handles: [],
        stopAll: function () { _.each(this._handles, function (d) { d.stop(); }); },
        autorun: function (f) { this._handles.push(Deps.autorun(f)); }
    };

    self._sessId = Random.id();
    self.Session = {
        destroyAll: function () {
            _.each(Object.keys(Session.keys), function (key) {
                var sessCheck = new RegExp('-' + self._sessId + '$');
                if(sessCheck.test(key)) {
                    Session.set([key]);
                    delete Session.keys[key];
                }
            });
        },
        set: function (key, val) { return Session.set(key + '-' + self._sessId, val); },
        get: function (key) { return Session.get(key + '-' + self._sessId); },
        equals: function (key, val) { return Session.equals(key + '-' + self._sessId, val); }
    };
};