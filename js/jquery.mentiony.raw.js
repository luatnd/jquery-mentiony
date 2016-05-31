/*
 * Contentediable Mentiony jQuery plugin
 * Version 0.1.0
 * Written by: Luat Nguyen(luatnd) on 2016/05/27
 *
 * Transform textarea or input into contentediable with mention feature.
 *
 * License: MIT License - http://www.opensource.org/licenses/mit-license.php
 */

(function ($) {
    var KEY = {
        AT:              64,
        BACKSPACE:       8,
        DELETE:          46,
        TAB:             9,
        ESC:             27,
        RETURN:          13,
        LEFT:            37,
        UP:              38,
        RIGHT:           39,
        DOWN:            40,
        SPACE:           32,
        HOME:            36,
        END:             35,
        COMMA:           188,
        NUMPAD_ADD:      107,
        NUMPAD_DECIMAL:  110,
        NUMPAD_DIVIDE:   111,
        NUMPAD_ENTER:    108,
        NUMPAD_MULTIPLY: 106,
        NUMPAD_SUBTRACT: 109,
        PAGE_DOWN:       34,
        PAGE_UP:         33,
        PERIOD:          190,
    };

    jQuery.fn.mentiony = function (method, options) {
        var defaults = {
            debug:              0, // Set 1 to see console log message of this plugin
            containerPaddingPx: 10, // css: OOOpx
            globalTimeout:      null, // Don't overwrite this config
            timeOut:            400, // Do mention only when user input idle time > this value
            triggerChar:        '@', // @keyword-to-mention
            onDataRequest:      $.noop, // a function for mention data processing

            // adjust popover relative position with its parent.
            popoverOffset:      {
                x: 50,
                y: 25
            },

            templates:          {
                container:        '<div id="mentiony-container-[ID]" class="mentiony-container"></div>',
                content:          '<div id="mentiony-content-[ID]" class="mentiony-content" contenteditable="true"></div>',
                popover:          '<div id="mentiony-popover-[ID]" class="mentiony-popover"></div>',
                list:             '<ul id="mentiony-popover-[ID]" class="mentiony-list"></ul>',
                listItem:         '<li class="mentiony-item" data-item-id="">' +
                                  '<div class="row">' +
                                  '<div class="col-xs-3 col-sm-3 col-md-3 col-lg-3">' +
                                  '<img src="https://avatars2.githubusercontent.com/u/1859127?v=3&s=140">' +
                                  '</div>' +
                                  '<div class="pl0 col-xs-9 col-sm-9 col-md-9 col-lg-9">' +
                                  '<p class="title">Company name</p>' +
                                  '<p class="help-block">Addition information</p>' +
                                  '</div>' +
                                  '</div>' +
                                  '</li>',
                normalText:       '<span class="normal-text">&nbsp;</span>',
                highlight:        '<span class="highlight"></span>',
                highlightContent: '<a href="[HREF]" class="mentiony-link">[TEXT]</a>',
            }
        };

        if (typeof method === 'object' || !method) {
            options = method;
        }

        var settings = $.extend({}, defaults, options);

        return this.each(function () {
            var instance = $.data(this, 'mentiony') || $.data(this, 'mentiony', new MentionsInput(settings));

            if (typeof instance[method] === 'function') {
                return instance[method].apply(this, Array.prototype.slice.call(outerArguments, 1));
            } else if (typeof method === 'object' || !method) {
                return instance.init.call(this, this);
            } else {
                $.error('Method ' + method + ' does not exist');
            }
        });
    };

    var MentionsInput = function (settings) {
        var elmInputBoxContainer, elmInputBoxContent, elmInputBox,
            elmInputBoxInitialWidth, elmInputBoxInitialHeight,
            popoverEle, list,
            dropDownShowing = false,
            events          = {
                keyDown:  false,
                keyPress: false,
                input:    false,
                keyup:    false,
            },
            currentMention  = {
                keyword:            '',
                jqueryDomNode:      null, // represent jQuery dom data
                mentionItemDataSet: [], // list item json data was store here
                lastActiveNode:     0,
                charAtFound:        false, // tracking @ char appear or not
            }
            ;
        var needMention = false; // Mention state
        var inputId = Math.random().toString(36).substr(2, 6); // generate 6 character rand string

        var onDataRequestCompleteCallback = function (responseData) {
            populateDropdown(currentMention.keyword, responseData);
        };

        function initTextArea(ele) {
            elmInputBox = $(ele);

            if (elmInputBox.attr('data-mentions-input') == 'true') {
                return;
            } else {
                elmInputBox.attr('data-mentions-input', 'true');
            }

            // Initial UI information
            elmInputBoxInitialWidth = elmInputBox.prop('scrollWidth');
            elmInputBoxInitialHeight = elmInputBox.prop('scrollHeight');

            // Container
            elmInputBoxContainer = $(settings.templates.container.replace('[ID]', inputId));
            elmInputBoxContent = $(settings.templates.content.replace('[ID]', inputId));

            // Make UI and hide the textarea
            elmInputBoxContainer.append(elmInputBox.clone().addClass('mention-input-hidden'));
            elmInputBoxContainer.append(elmInputBoxContent);
            elmInputBox.replaceWith(elmInputBoxContainer);

            popoverEle = $(settings.templates.popover.replace('[ID]', inputId));
            list = $(settings.templates.list.replace('[ID]', inputId));
            elmInputBoxContainer.append(popoverEle);
            popoverEle.append(list);


            // Update initial UI
            elmInputBoxContainer.css({
                width:   (elmInputBoxInitialWidth + 2 * settings.containerPaddingPx) + 'px',
                padding: settings.containerPaddingPx + 'px',
            });
            elmInputBoxContent.width(elmInputBoxInitialWidth + 'px');
            elmInputBoxContent.css({minHeight: elmInputBoxInitialHeight + 'px'});


            // This event occured from top to down.
            // When press a key: onInputBoxKeyDown --> onInputBoxKeyPress --> onInputBoxInput --> onInputBoxKeyUp
            elmInputBoxContent.bind('keydown', onInputBoxKeyDown);
            elmInputBoxContent.bind('keypress', onInputBoxKeyPress);
            elmInputBoxContent.bind('input', onInputBoxInput);
            elmInputBoxContent.bind('keyup', onInputBoxKeyUp);
            elmInputBoxContent.bind('click', onInputBoxClick);
            // elmInputBoxContent.bind('blur', onInputBoxBlur);
        }

        /**
         * Put all special key handle here
         * @param e
         */
        function onInputBoxKeyDown(e) {
            // log('onInputBoxKeyDown');

            // reset events tracking
            events = {
                keyDown:  true,
                keyPress: false,
                input:    false,
                keyup:    false,
            };


            if (dropDownShowing) {
                return handleUserChooseOption(e);
            }
        }

        /**
         * Character was entered was handled here
         * This event occur when a printable was pressed. Or combined multi key was handle here, up/down can not read combined key
         * NOTE: Delete key is not be triggered here
         * @param e
         */
        function onInputBoxKeyPress(e) {
            // log('onInputBoxKeyPress');
            events.keyPress = true;

            if (!needMention) {
                // Try to check if need mention
                needMention = (e.keyCode === KEY.AT);
                // log(needMention, 'needMention', 'info');
            }
        }


        /**
         * When input value was change, with any key effect the input value
         * Delete was trigger here
         */
        function onInputBoxInput() {
            // log('onInputBoxInput');
            events.input = true;
        }

        /**
         * Put all special key handle here
         * @param e
         */
        function onInputBoxKeyUp(e) {
            // log('onInputBoxKeyUp');
            events.keyup = true;
            // log(events, 'events');

            if (events.input) {
                updateDataOnKeyUp(e);
            }

            if (needMention) {
                // Update mention keyword only inputing(not enter), left, right
                if (e.keyCode !== KEY.RETURN && (events.input || e.keyCode === KEY.LEFT || e.keyCode === KEY.RIGHT)) {
                    updateMentionKeyword(e);
                    doSearchAndShow();
                }
            }
        }

        function onInputBoxClick(e) {
            // log('onInputBoxClick');

            if (needMention) {
                updateMentionKeyword(e);
                doSearchAndShow();
            }
        }

        function updateDataOnKeyUp(e) {
            elmInputBoxText = elmInputBoxContent.html();
            elmInputBox.val(elmInputBoxText);
            log(elmInputBox.val(), 'elmInputBoxText : ');
        }

        function onListItemClick(e) {
            //$(this) is the clicked listItem
            setSelectedMention($(this));
            choosedMentionOptions(true);
        }

        function doSearchAndShow() {

            if (settings.timeOut > 0) {
                if (settings.globalTimeout !== null) {
                    clearTimeout(settings.globalTimeout);
                }
                settings.globalTimeout = setTimeout(function () {
                    settings.globalTimeout = null;

                    settings.onDataRequest.call(this, 'search', currentMention.keyword, onDataRequestCompleteCallback);

                }, settings.timeOut);

            } else {
                settings.onDataRequest.call(this, 'search', currentMention.keyword, onDataRequestCompleteCallback);
            }
        }

        function showDropDown() {
            var curPos = getSelectionCoords();
            dropDownShowing = true;
            popoverEle.css({
                display: 'block',
                top:     curPos.y - settings.popoverOffset.x,
                left:    curPos.x - settings.popoverOffset.y,
            });
        }

        function hideDropDown() {
            dropDownShowing = false;
            popoverEle.css({display: 'none'});
        }

        /**
         * Get dropdown
         * @param keyword
         * @param responseData
         */
        function populateDropdown(keyword, responseData) {
            list.empty();
            currentMention.jqueryDomNode = null;
            currentMention.mentionItemDataSet = responseData;

            if (responseData.length) {
                if (currentMention.charAtFound === true) {
                    showDropDown();
                }

                responseData.forEach(function (item, index) {
                    var listItem = $(settings.templates.listItem);
                    listItem.attr('data-item-id', item.id);
                    listItem.find('img:first').attr('src', item.avatar);
                    listItem.find('p.title:first').html(item.name);
                    listItem.find('p.help-block:first').html(item.info);
                    listItem.bind('click', onListItemClick);
                    list.append(listItem);
                });

            } else {
                hideDropDown();
            }
        }


        /**
         * @param e
         * @returns {boolean} Continue to run the rest of code or not. If choosing metion or choosed mention, will stop doing anything else.
         */
        function handleUserChooseOption(e) {
            if (!dropDownShowing) {
                return true;
            }

            if (e.keyCode === KEY.UP || e.keyCode === KEY.DOWN) {
                choosingMentionOptions(e);
                return false;
            }

            // Try to exit mention state: Stop mention if @, Home, Enter, Tabs
            if ((e.keyCode === KEY.HOME)
                || (e.keyCode === KEY.RETURN)
                || (e.keyCode === KEY.TAB)
            ) {
                choosedMentionOptions();
                return false;
            }

            return true;
        }

        /**
         * Update mention keyword on: Input / LEFT-RIGHT
         */
        function updateMentionKeyword(e) {
            if (document.selection) {
                // var node = document.selection.createRange().parentElement(); // IE
                var node = document.selection.createRange(); // IE
                // TODO: Test on IE
            } else {
                // var node = window.getSelection().anchorNode.parentNode; // everyone else
                var node = window.getSelection().anchorNode; // everyone else
            }

            var textNodeData = node.data;
            var cursorPosition = getSelectionEndPositionInCurrentLine(); // passing the js DOM ele

            // Save current position for mouse click handling, because when you use mouse, no selection was found.
            currentMention.lastActiveNode = node;

            // reset and set new mention keyword
            currentMention.keyword = '';

            var i = cursorPosition - 1; // NOTE: cursorPosition is Non-zero base
            var next = true;
            while (next) {
                var charAt = textNodeData.charAt(i);
                if (charAt === '' || charAt === settings.triggerChar) {
                    next = false;
                }
                i--;
            }

            currentMention.keyword = textNodeData.substring(i + 1, cursorPosition);
            if (currentMention.keyword.indexOf(settings.triggerChar) === -1) {
                currentMention.keyword = '';
                currentMention.charAtFound = false;

                // NOTE: Still need mention but turn off dropdown now
                hideDropDown();
            } else {
                currentMention.keyword = currentMention.keyword.substring(1, cursorPosition);
                currentMention.charAtFound = true;
            }

            log(currentMention.keyword, 'currentMention.keyword');
        }

        function getMentionKeyword() {
            return currentMention.keyword;
        }

        function choosingMentionOptions(e) {
            log('choosingMentionOptions');

            // Get Selected mention Item
            if (currentMention.jqueryDomNode === null) {
                setSelectedMention(list.children().first());
            }

            var item = [];

            if (e.keyCode === KEY.DOWN) {
                item = currentMention.jqueryDomNode.next();
            } else if (e.keyCode === KEY.UP) {
                item = currentMention.jqueryDomNode.prev();
            }

            if (item.length === 0) {
                item = currentMention.jqueryDomNode;
            }

            setSelectedMention(item);
        }


        /**
         * Update UI, show the selected item
         * @param item Jquery object represent the list-item
         */
        function setSelectedMention(item) {
            currentMention.jqueryDomNode = item;
            updateSelectedMentionUI(item);

            log(item, 'setSelectedMention item: ');
        }

        function updateSelectedMentionUI(selectedMentionItem) {
            $.each(list.children(), function (i, listItem) {
                $(listItem).removeClass('active');
            });
            selectedMentionItem.addClass('active');
        }

        /**
         * Handle UI and data when user choose an mention option.
         */
        function choosedMentionOptions(chooseByMouse) {
            if (chooseByMouse === 'undefined') {
                chooseByMouse = false;
            }
            log('choosedMentionOptions by ' + (chooseByMouse ? 'Mouse' : 'Keyboard'));

            var currentMentionItemData = {};

            var selectedId = currentMention.jqueryDomNode.attr('data-item-id');
            for (var i = 0, len = currentMention.mentionItemDataSet.length; i < len; i++) {
                if (selectedId == currentMention.mentionItemDataSet[i].id) {
                    currentMentionItemData = currentMention.mentionItemDataSet[i];
                    break;
                }
            }

            var highlightNode = $(settings.templates.highlight);
            var highlightContentNode = $(settings.templates.highlightContent
                .replace('[HREF]', currentMentionItemData.href)
                .replace('[TEXT]', currentMentionItemData.name)
            );
            highlightNode.append(highlightContentNode);
            replaceTextInRange('@' + currentMention.keyword, highlightNode.prop('outerHTML'), chooseByMouse);


            // Finish mention
            log('Finish mention', '', 'warn');

            needMention = false; // Reset mention state
            currentMention.keyword = ''; // reset current Data if start with @

            hideDropDown();
        }

        function log(msg, prefix, level) {
            if (typeof level === 'undefined') {
                level = 'log';
            }
            if (settings.debug === 1) {
                eval("console." + level + "(inputId, prefix ? prefix + ':' : '', msg);");
            }
        }

        /**
         * Replace fromString before cursor with toTextHtml
         * NOTE: depend on jQuery
         * @param fromString
         * @param toTextHtml
         * @param choosedByMouse
         */
        function replaceTextInRange(fromString, toTextHtml, choosedByMouse) {
            var positionInfo = {
                startBefore: 0,
                startAfter:  0,
                stopBefore:  0,
                stopAfter:   0,
            };

            var sel = window.getSelection();
            var range;


            // Move caret to current caret in case of contentediable is not active --> no caret

            if (choosedByMouse !== 'undefined' && choosedByMouse === true) {
                var lastActiveNode = currentMention.lastActiveNode;

                range = document.createRange();
                range.setStart(lastActiveNode, lastActiveNode.data.length);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);

                // TODO: Bug: Choose mention by mouse: @123456: IF user put caret between 2 & 3 THEN the highlight will replace only 3456
            }

            var isIE = false;

            var stopPos = sel.focusOffset;
            var startPos = stopPos - fromString.length;

            if (window.getSelection) {
                isIE = false;
                sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    range = sel.getRangeAt(0).cloneRange();
                    range.collapse(true);
                }
            } else if ((sel = document.selection) && sel.type != "Control") {
                range = sel.createRange();
                isIE = true;
            }

            if (startPos !== stopPos) {
                // replace / Remove content
                range.setStart(sel.anchorNode, startPos);
                range.setEnd(sel.anchorNode, stopPos);
                range.deleteContents();
            }

            // insert
            var node = document.createElement('span');
            node.setAttribute('class', 'mention-area');
            node.innerHTML = toTextHtml;
            range.insertNode(node);
            range.setEnd(sel.focusNode, range.endContainer.length);

            positionInfo.startBefore = startPos;
            positionInfo.stopBefore = stopPos;
            positionInfo.startAfter = startPos;
            positionInfo.stopAfter = startPos + node.innerText.length;


            // move cursor to end of keyword after replace
            var stop = false;
            node = $(sel.anchorNode);
            while (!stop) {
                if (node.next().text().length === 0) {
                    stop = true;
                }
                else {
                    node = node.next();
                }
            }

            // insert <newElem> after list
            var newElem = $(settings.templates.normalText).insertAfter(node);

            // move caret to after <newElem>
            range = document.createRange();
            range.setStartAfter(newElem.get(0));
            range.setEndAfter(newElem.get(0));
            sel.removeAllRanges();
            sel.addRange(range);

            return positionInfo;
        }


        // Public methods
        return {
            init: function (domTarget) {
                initTextArea(domTarget);
            },
        };
    };


    /**
     * Thank to Tim Down: http://stackoverflow.com/questions/6846230/coordinates-of-selected-text-in-browser-page
     * @param win
     * @returns {{x: number, y: number}}
     */
    function getSelectionCoords(win) {
        win = win || window;
        var doc = win.document;
        var sel = doc.selection, range, rects, rect;
        var x = 0, y = 0;
        if (sel) {
            if (sel.type != "Control") {
                range = sel.createRange();
                range.collapse(true);
                x = range.boundingLeft;
                y = range.boundingTop;
            }
        } else if (win.getSelection) {
            sel = win.getSelection();
            if (sel.rangeCount) {
                range = sel.getRangeAt(0).cloneRange();
                if (range.getClientRects) {
                    range.collapse(true);
                    rects = range.getClientRects();
                    if (rects.length > 0) {
                        rect = rects[0];
                    }
                    x = rect.left;
                    y = rect.top;
                }
                // Fall back to inserting a temporary element
                if (x == 0 && y == 0) {
                    var span = doc.createElement("span");
                    if (span.getClientRects) {
                        // Ensure span has dimensions and position by
                        // adding a zero-width space character
                        span.appendChild(doc.createTextNode("\u200b"));
                        range.insertNode(span);
                        rect = span.getClientRects()[0];
                        x = rect.left;
                        y = rect.top;
                        var spanParent = span.parentNode;
                        spanParent.removeChild(span);

                        // Glue any broken text nodes back together
                        spanParent.normalize();
                    }
                }
            }
        }
        return {x: x, y: y};
    }

    function getSelectionEndPositionInCurrentLine() {
        var selectionEndPos = 0;
        if (window.getSelection) {
            var sel = window.getSelection();
            selectionEndPos = sel.focusOffset;
        }

        return selectionEndPos;
    }

    /**
     * Paste html at caret
     * Thank to Tim: http://stackoverflow.com/questions/6690752/insert-html-at-caret-in-a-contenteditable-div/6691294#6691294
     * @param html <string> Paste HTML into current cursor position of ediable area
     * @param selectPastedContent <bool> Content was selected after insert or not
     */
    function pasteHtmlAtCaret(html, selectPastedContent) {
        var selection, range;
        if (window.getSelection) {
            // IE9 and non-IE
            selection = window.getSelection();
            if (selection.getRangeAt && selection.rangeCount) {
                range = selection.getRangeAt(0);
                range.deleteContents();

                // Range.createContextualFragment() would be useful here but is
                // only relatively recently standardized and is not supported in
                // some browsers (IE9, for one)
                var el = document.createElement("div");
                el.innerHTML = html;
                var frag = document.createDocumentFragment(), node, lastNode;
                while ((node = el.firstChild)) {
                    lastNode = frag.appendChild(node);
                }
                var firstNode = frag.firstChild;
                range.insertNode(frag);

                // Preserve the selection
                if (lastNode) {
                    range = range.cloneRange();
                    range.setStartAfter(lastNode);
                    if (selectPastedContent) {
                        range.setStartBefore(firstNode);
                    } else {
                        range.collapse(true);
                    }
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        } else if ((selection = document.selection) && selection.type != "Control") {
            // IE < 9
            var originalRange = selection.createRange();
            originalRange.collapse(true);
            selection.createRange().pasteHTML(html);
            if (selectPastedContent) {
                range = selection.createRange();
                range.setEndPoint("StartToStart", originalRange);
                range.select();
            }
        }
    }

    /**
     * Thank to Tim also: http://stackoverflow.com/questions/4811822/get-a-ranges-start-and-end-offsets-relative-to-its-parent-container/4812022#4812022
     * @param element It's pure JS DOM element, not jQuery.
     * @returns {number}
     */
    function getCaretCharacterOffsetWithin(element) {
        var caretOffset = 0;
        var doc = element.ownerDocument || element.document;
        var win = doc.defaultView || doc.parentWindow;
        var sel;
        if (typeof win.getSelection != "undefined") {
            sel = win.getSelection();
            if (sel.rangeCount > 0) {
                var range = win.getSelection().getRangeAt(0);
                var preCaretRange = range.cloneRange();
                preCaretRange.selectNodeContents(element);
                preCaretRange.setEnd(range.endContainer, range.endOffset);
                caretOffset = preCaretRange.toString().length;
            }
        } else if ((sel = doc.selection) && sel.type != "Control") {
            var textRange = sel.createRange();
            var preCaretTextRange = doc.body.createTextRange();
            preCaretTextRange.moveToElementText(element);
            preCaretTextRange.setEndPoint("EndToEnd", textRange);
            caretOffset = preCaretTextRange.text.length;
        }
        return caretOffset;
    }

    /**
     * Thank to Zurb: http://zurb.com/forrst/posts/Tracking_the_caret_position_in_a_contenteditable-P4l
     * @param editableDiv
     * @returns {number}
     */
    function getCaretPosition(editableDiv) {
        var caretPos = 0, containerEl = null, sel, range;
        if (window.getSelection) {
            sel = window.getSelection();
            if (sel.rangeCount) {
                range = sel.getRangeAt(0);
                if (range.commonAncestorContainer.parentNode == editableDiv) {
                    caretPos = range.endOffset;
                }
            }
        } else if (document.selection && document.selection.createRange) {
            range = document.selection.createRange();
            if (range.parentElement() == editableDiv) {
                var tempEl = document.createElement("span");
                editableDiv.insertBefore(tempEl, editableDiv.firstChild);
                var tempRange = range.duplicate();
                tempRange.moveToElementText(tempEl);
                tempRange.setEndPoint("EndToEnd", range);
                caretPos = tempRange.text.length;
            }
        }
        return caretPos;
    }


    /**
     * Move caret
     */
    function moveCaret(sel, range, charCount) {
        if (window.getSelection) {
            if (sel.rangeCount > 0) {
                var textNode = sel.focusNode;
                var newOffset = sel.focusOffset + charCount;
                sel.collapse(textNode, Math.min(textNode.length, newOffset));
            }
        } else if ((sel = window.document.selection)) {
            if (sel.type != "Control") {
                range = sel.createRange();
                range.move("character", charCount);
                range.select();
            }
        }
    }

    /**
     * Insert/ replace a selection with htmlText
     * @param toTextHtml
     */
    function insertTextToSelection(toTextHtml) {
        if (window.getSelection) {
            var sel = window.getSelection();
            var stopPos = sel.focusOffset;
            var range;

            if (window.getSelection) {
                sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    range = sel.getRangeAt(0).cloneRange();
                    range.collapse(true);

                }
            } else if ((sel = document.selection) && sel.type != "Control") {
                range = sel.createRange();
            }

            // insert
            var node = document.createElement('span');
            node.setAttribute('class', 'mention-area');
            node.innerHTML = toTextHtml;
            range.insertNode(node);
            // range.setStart(sel.anchorNode, stopPos);
            // range.setEnd(sel.anchorNode, stopPos + node.innerText.length);

        } else {
            log(text, 'Can not insert text', 'warn');
        }
    }


    // TODO: Dropdown: scroll to see more item WHEN user press DOWN and reach the end of list.
    // TODO: Change to A cross-browser JavaScript range and selection library.: https://github.com/timdown/rangy

}(jQuery));
