/*
 * Copyright 2020 Adobe. All rights reserved.
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
import React, {useRef} from 'react';
import {useOverlay} from '../';

function Overlay(props: {isOpen?: boolean, onClose?: () => void, isKeyboardDismissDisabled?: boolean}) {
  let ref = useRef<HTMLDivElement>(null);
  let {overlayProps} = useOverlay({
    isOpen: props.isOpen,
    onClose: props.onClose,
    isKeyboardDismissDisabled: props.isKeyboardDismissDisabled
  }, ref);

  return props.isOpen ? <div {...overlayProps} ref={ref} data-testid="overlay">Overlay</div> : null;
}

describe('useOverlay', () => {
  // JSDOM doesn't support CloseWatcher, so these tests verify the keyboard fallback path.
  // CloseWatcher support is tested separately below with module isolation.
  describe('escape key handling', () => {
    it('closes overlay on Escape key press', () => {
      let onClose = jest.fn();
      let {getByTestId} = render(<Overlay isOpen onClose={onClose} />);

      fireEvent.keyDown(getByTestId('overlay'), {key: 'Escape'});
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on Escape when isKeyboardDismissDisabled is true', () => {
      let onClose = jest.fn();
      let {getByTestId} = render(<Overlay isOpen onClose={onClose} isKeyboardDismissDisabled />);

      fireEvent.keyDown(getByTestId('overlay'), {key: 'Escape'});
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not close on other keys', () => {
      let onClose = jest.fn();
      let {getByTestId} = render(<Overlay isOpen onClose={onClose} />);

      fireEvent.keyDown(getByTestId('overlay'), {key: 'Enter'});
      expect(onClose).not.toHaveBeenCalled();
    });

    it('only closes topmost overlay in stack', () => {
      let onClose1 = jest.fn();
      let onClose2 = jest.fn();

      function StackedOverlays() {
        let ref1 = useRef<HTMLDivElement>(null);
        let ref2 = useRef<HTMLDivElement>(null);
        let {overlayProps: overlay1Props} = useOverlay({isOpen: true, onClose: onClose1}, ref1);
        let {overlayProps: overlay2Props} = useOverlay({isOpen: true, onClose: onClose2}, ref2);

        return (
          <>
            <div {...overlay1Props} ref={ref1} data-testid="overlay1">Overlay 1</div>
            <div {...overlay2Props} ref={ref2} data-testid="overlay2">Overlay 2</div>
          </>
        );
      }

      let {getByTestId} = render(<StackedOverlays />);

      // Press Escape on the topmost overlay
      fireEvent.keyDown(getByTestId('overlay2'), {key: 'Escape'});

      // Only the topmost overlay should close
      expect(onClose2).toHaveBeenCalledTimes(1);
      expect(onClose1).not.toHaveBeenCalled();
    });
  });
});
