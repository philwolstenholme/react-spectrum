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

import {DOMAttributes, RefObject} from '@react-types/shared';
import {isElementInChildOfActiveScope} from '@react-aria/focus';
import {useEffect, useRef} from 'react';
import {useEffectEvent} from '@react-aria/utils';
import {useFocusWithin, useInteractOutside} from '@react-aria/interactions';

export interface AriaOverlayProps {
  /** Whether the overlay is currently open. */
  isOpen?: boolean,

  /** Handler that is called when the overlay should close. */
  onClose?: () => void,

  /**
   * Whether to close the overlay when the user interacts outside it.
   * @default false
   */
  isDismissable?: boolean,

  /** Whether the overlay should close when focus is lost or moves outside it. */
  shouldCloseOnBlur?: boolean,

  /**
   * Whether pressing the escape key to close the overlay should be disabled.
   * @default false
   */
  isKeyboardDismissDisabled?: boolean,

  /**
   * When user interacts with the argument element outside of the overlay ref,
   * return true if onClose should be called.  This gives you a chance to filter
   * out interaction with elements that should not dismiss the overlay.
   * By default, onClose will always be called on interaction outside the overlay ref.
   */
  shouldCloseOnInteractOutside?: (element: Element) => boolean
}

export interface OverlayAria {
  /** Props to apply to the overlay container element. */
  overlayProps: DOMAttributes,
  /** Props to apply to the underlay element, if any. */
  underlayProps: DOMAttributes
}

const visibleOverlays: RefObject<Element | null>[] = [];

/**
 * Provides the behavior for overlays such as dialogs, popovers, and menus.
 * Hides the overlay when the user interacts outside it, when the Escape key is pressed,
 * or optionally, on blur. Only the top-most overlay will close at once.
 */
export function useOverlay(props: AriaOverlayProps, ref: RefObject<Element | null>): OverlayAria {
  let {
    onClose,
    shouldCloseOnBlur,
    isOpen,
    isDismissable = false,
    isKeyboardDismissDisabled = false,
    shouldCloseOnInteractOutside
  } = props;

  let lastVisibleOverlay = useRef<RefObject<Element | null>>(undefined);

  // Add the overlay ref to the stack of visible overlays on mount, and remove on unmount.
  useEffect(() => {
    if (isOpen && !visibleOverlays.includes(ref)) {
      visibleOverlays.push(ref);
      return () => {
        let index = visibleOverlays.indexOf(ref);
        if (index >= 0) {
          visibleOverlays.splice(index, 1);
        }
      };
    }
  }, [isOpen, ref]);

  // Only hide the overlay when it is the topmost visible overlay in the stack.
  let onHide = () => {
    if (visibleOverlays[visibleOverlays.length - 1] === ref && onClose) {
      onClose();
    }
  };

  // Use CloseWatcher API when available to handle close requests (Escape key, back button, etc.).
  // CloseWatcher is automatically destroyed after firing, so we need to create a new one.
  // This replaces the onKeyDown Escape handler when supported.
  let closeWatcherRef = useRef<any>(null);
  let supportsCloseWatcher = typeof window !== 'undefined' && 'CloseWatcher' in window;

  // Wrap onHide in useEffectEvent to avoid stale closure in CloseWatcher handler
  let onHideEvent = useEffectEvent(onHide);

  useEffect(() => {
    if (!isOpen || isKeyboardDismissDisabled || !supportsCloseWatcher) {
      return;
    }

    let isMounted = true;

    let createCloseWatcher = () => {
      // @ts-ignore - CloseWatcher is a newer API not yet in all TypeScript libs
      let watcher = new window.CloseWatcher();
      watcher.addEventListener('close', () => {
        onHideEvent();
        // CloseWatcher is automatically destroyed after firing.
        // Create a new one if the effect is still active (overlay still open).
        if (isMounted) {
          closeWatcherRef.current = createCloseWatcher();
        }
      });
      return watcher;
    };

    closeWatcherRef.current = createCloseWatcher();

    return () => {
      isMounted = false;
      closeWatcherRef.current?.destroy();
      closeWatcherRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isKeyboardDismissDisabled]);

  let onInteractOutsideStart = (e: PointerEvent) => {
    const topMostOverlay = visibleOverlays[visibleOverlays.length - 1];
    lastVisibleOverlay.current = topMostOverlay;
    if (!shouldCloseOnInteractOutside || shouldCloseOnInteractOutside(e.target as Element)) {
      if (topMostOverlay === ref) {
        e.stopPropagation();
        e.preventDefault();
      }
    }
  };

  let onInteractOutside = (e: PointerEvent) => {
    if (!shouldCloseOnInteractOutside || shouldCloseOnInteractOutside(e.target as Element)) {
      if (visibleOverlays[visibleOverlays.length - 1] === ref) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (lastVisibleOverlay.current === ref) {
        onHide();
      }
    }
    lastVisibleOverlay.current = undefined;
  };

  // Handle the escape key (fallback when CloseWatcher is not supported)
  let onKeyDown = (e) => {
    if (supportsCloseWatcher) {
      return;
    }
    if (e.key === 'Escape' && !isKeyboardDismissDisabled && !e.nativeEvent.isComposing) {
      e.stopPropagation();
      e.preventDefault();
      onHide();
    }
  };

  // Handle clicking outside the overlay to close it
  useInteractOutside({ref, onInteractOutside: isDismissable && isOpen ? onInteractOutside : undefined, onInteractOutsideStart});

  let {focusWithinProps} = useFocusWithin({
    isDisabled: !shouldCloseOnBlur,
    onBlurWithin: (e) => {
      // Do not close if relatedTarget is null, which means focus is lost to the body.
      // That can happen when switching tabs, or due to a VoiceOver/Chrome bug with Control+Option+Arrow navigation.
      // Clicking on the body to close the overlay should already be handled by useInteractOutside.
      // https://github.com/adobe/react-spectrum/issues/4130
      // https://github.com/adobe/react-spectrum/issues/4922
      //
      // If focus is moving into a child focus scope (e.g. menu inside a dialog),
      // do not close the outer overlay. At this point, the active scope should
      // still be the outer overlay, since blur events run before focus.
      if (!e.relatedTarget || isElementInChildOfActiveScope(e.relatedTarget)) {
        return;
      }

      if (!shouldCloseOnInteractOutside || shouldCloseOnInteractOutside(e.relatedTarget as Element)) {
        onClose?.();
      }
    }
  });

  let onPointerDownUnderlay = e => {
    // fixes a firefox issue that starts text selection https://bugzilla.mozilla.org/show_bug.cgi?id=1675846
    if (e.target === e.currentTarget) {
      e.preventDefault();
    }
  };

  return {
    overlayProps: {
      onKeyDown,
      ...focusWithinProps
    },
    underlayProps: {
      onPointerDown: onPointerDownUnderlay
    }
  };
}
