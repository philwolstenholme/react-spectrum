/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import {fireEvent, render} from '@react-spectrum/test-utils-internal';
import {type OverlayTriggerProps, useOverlayTriggerState} from '@react-stately/overlays';
import React, {useRef} from 'react';
import {useOverlay} from '../src/useOverlay';
import {useOverlayTrigger} from '../src/useOverlayTrigger';
import {usePopover} from '../src/usePopover';

function Example(props: OverlayTriggerProps) {
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const state = useOverlayTriggerState(props);
  useOverlayTrigger({type: 'listbox'}, state, triggerRef);
  const {popoverProps} = usePopover({triggerRef, popoverRef}, state);

  return (
    <div>
      <div ref={triggerRef} />
      <div {...popoverProps} ref={popoverRef} />
    </div>
  );
}

describe('usePopover', () => {
  it('should not close popover on scroll', () => {
    const onOpenChange = jest.fn();
    render(<Example isOpen onOpenChange={onOpenChange} />);

    fireEvent.scroll(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('useOverlay', () => {
  describe('CloseWatcher', () => {
    let mockCloseWatchers: MockCloseWatcher[] = [];
    let originalCloseWatcher: any;

    class MockCloseWatcher {
      onclose: (() => void) | null = null;
      oncancel: (() => void) | null = null;
      destroyed = false;

      constructor() {
        mockCloseWatchers.push(this);
      }

      destroy() {
        this.destroyed = true;
        this.onclose = null;
        this.oncancel = null;
      }

      triggerClose() {
        if (!this.destroyed && this.onclose) {
          this.onclose();
        }
      }
    }

    function OverlayExample(props: {isOpen?: boolean, onClose?: () => void, isKeyboardDismissDisabled?: boolean}) {
      let ref = useRef<HTMLDivElement>(null);
      let {overlayProps} = useOverlay({
        isOpen: props.isOpen,
        onClose: props.onClose,
        isKeyboardDismissDisabled: props.isKeyboardDismissDisabled
      }, ref);

      return props.isOpen ? <div {...overlayProps} ref={ref} data-testid="overlay">Overlay</div> : null;
    }

    beforeAll(() => {
      originalCloseWatcher = (window as any).CloseWatcher;
      (window as any).CloseWatcher = MockCloseWatcher;
    });

    afterAll(() => {
      if (originalCloseWatcher) {
        (window as any).CloseWatcher = originalCloseWatcher;
      } else {
        delete (window as any).CloseWatcher;
      }
    });

    beforeEach(() => {
      mockCloseWatchers.forEach(w => w.destroy());
      mockCloseWatchers = [];
    });

    afterEach(() => {
      mockCloseWatchers.forEach(w => w.destroy());
      mockCloseWatchers = [];
    });

    it('should use CloseWatcher when available', () => {
      let onClose = jest.fn();
      render(<OverlayExample isOpen onClose={onClose} />);

      expect(mockCloseWatchers.length).toBe(1);
      expect(mockCloseWatchers[0].destroyed).toBe(false);
    });

    it('should call onClose when CloseWatcher close event fires', () => {
      let onClose = jest.fn();
      render(<OverlayExample isOpen onClose={onClose} />);

      expect(mockCloseWatchers.length).toBe(1);
      mockCloseWatchers[0].triggerClose();

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should destroy CloseWatcher when overlay unmounts', () => {
      let onClose = jest.fn();
      let {unmount} = render(<OverlayExample isOpen onClose={onClose} />);

      expect(mockCloseWatchers.length).toBe(1);
      let watcher = mockCloseWatchers[0];
      expect(watcher.destroyed).toBe(false);

      unmount();

      expect(watcher.destroyed).toBe(true);
    });

    it('should not create CloseWatcher when isKeyboardDismissDisabled is true', () => {
      let onClose = jest.fn();
      render(<OverlayExample isOpen onClose={onClose} isKeyboardDismissDisabled />);

      expect(mockCloseWatchers.length).toBe(0);
    });

    it('should create one CloseWatcher per overlay', () => {
      let onCloseFirst = jest.fn();
      let onCloseSecond = jest.fn();
      render(<OverlayExample isOpen onClose={onCloseFirst} />);
      let second = render(<OverlayExample isOpen onClose={onCloseSecond} />);

      expect(mockCloseWatchers.length).toBe(2);
      expect(mockCloseWatchers[0].destroyed).toBe(false);
      expect(mockCloseWatchers[1].destroyed).toBe(false);

      // Simulate browser behavior: only topmost watcher fires
      mockCloseWatchers[1].triggerClose();
      expect(onCloseSecond).toHaveBeenCalledTimes(1);
      expect(onCloseFirst).not.toHaveBeenCalled();

      second.unmount();

      expect(mockCloseWatchers[1].destroyed).toBe(true);
      expect(mockCloseWatchers[0].destroyed).toBe(false);

      mockCloseWatchers[0].triggerClose();
      expect(onCloseFirst).toHaveBeenCalledTimes(1);
    });

    it('should not use keyboard handler when CloseWatcher is available', () => {
      let onClose = jest.fn();
      let {getByTestId} = render(<OverlayExample isOpen onClose={onClose} />);

      expect(mockCloseWatchers.length).toBe(1);

      fireEvent.keyDown(getByTestId('overlay'), {key: 'Escape'});

      expect(onClose).toHaveBeenCalledTimes(0);

      mockCloseWatchers[0].triggerClose();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should destroy CloseWatcher when overlay closes', () => {
      let onClose = jest.fn();
      let {rerender} = render(<OverlayExample isOpen onClose={onClose} />);

      expect(mockCloseWatchers.length).toBe(1);
      let watcher = mockCloseWatchers[0];
      expect(watcher.destroyed).toBe(false);

      rerender(<OverlayExample isOpen={false} onClose={onClose} />);

      expect(watcher.destroyed).toBe(true);
    });

    it('should handle undefined onClose without crashing', () => {
      render(<OverlayExample isOpen />);

      expect(mockCloseWatchers.length).toBe(1);

      // Should not throw when close event fires with no onClose handler
      expect(() => mockCloseWatchers[0].triggerClose()).not.toThrow();
    });
  });
});
