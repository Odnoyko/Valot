/**
 * DurationAnimator - Reusable animation for duration labels
 * 
 * Provides smooth "rolling counter" animation and visual pulse effects
 * for any GTK Label displaying duration/time
 * 
 * Features:
 * - Pulse/glitch visual effect on updates
 * - Smooth number transition (rolling counter)
 * - Automatic memory cleanup
 * - Reusable for all duration labels in the app
 */

import GLib from 'gi://GLib';
import { TimeUtils } from 'resource:///com/odnoyko/valot/core/utils/TimeUtils.js';

export class DurationAnimator {
    /**
     * Create a new DurationAnimator for a GTK Label
     * @param {Gtk.Label} label - The GTK Label to animate
     */
    constructor(label) {
        this.label = label;
        this._currentSeconds = undefined;
        this._animationId = null;
        this._pulseTimeoutIds = [];
    }

    /**
     * Animate to new duration value
     * @param {number} targetSeconds - Target duration in seconds
     * @param {boolean} animate - Whether to animate transition (true) or instant update (false)
     */
    animateTo(targetSeconds, animate = true) {
        if (!this.label || this.label.is_destroyed?.()) return;

        // Cancel any existing animation
        this._cancelAnimation();

        const startSeconds = this._currentSeconds || 0;
        const delta = targetSeconds - startSeconds;

        // Always show visual pulse effect
        this._showPulseEffect();

        // If first display, set value immediately (pulse already shown)
        if (this._currentSeconds === undefined) {
            this._currentSeconds = targetSeconds;
            this._updateLabel(targetSeconds);
            return;
        }

        // For small changes or disabled animation, just update (pulse already shown)
        if (!animate || Math.abs(delta) < 2) {
            this._currentSeconds = targetSeconds;
            this._updateLabel(targetSeconds);
            return;
        }

        // Start rolling counter animation
        this._startRollingAnimation(startSeconds, targetSeconds);
    }

    /**
     * Show visual pulse/glitch effect
     * Quick opacity flicker for visual feedback
     */
    _showPulseEffect() {
        if (!this.label || this.label.is_destroyed?.()) return;

        // Cancel any existing pulse timeouts
        this._pulseTimeoutIds.forEach(id => GLib.Source.remove(id));
        this._pulseTimeoutIds = [];

        // Pulse sequence: fast blink effect
        const pulseSteps = [
            { opacity: 1.0, delay: 0 },
            { opacity: 0.6, delay: 40 },
            { opacity: 0.9, delay: 80 },
            { opacity: 0.6, delay: 120 },
            { opacity: 1.0, delay: 160 },
        ];

        pulseSteps.forEach(step => {
            const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, step.delay, () => {
                if (this.label && !this.label.is_destroyed?.()) {
                    this.label.set_opacity(step.opacity);
                }
                return GLib.SOURCE_REMOVE;
            });
            this._pulseTimeoutIds.push(timeoutId);
        });
    }

    /**
     * Start rolling counter animation
     * Smoothly counts from current to target value
     */
    _startRollingAnimation(startSeconds, targetSeconds) {
        const delta = targetSeconds - startSeconds;
        
        // Animation parameters
        const duration = 300; // 300ms total
        const steps = 15; // 15 frames
        const stepDuration = duration / steps; // ~20ms per frame
        let currentStep = 0;

        // Easing function (ease-out cubic)
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        // Animation loop
        const animate_step = () => {
            currentStep++;
            const progress = currentStep / steps;
            const easedProgress = easeOutCubic(progress);

            // Calculate current value
            const currentSeconds = Math.floor(startSeconds + delta * easedProgress);
            this._currentSeconds = currentSeconds;

            // Update label
            this._updateLabel(currentSeconds);

            // Continue or finish
            if (currentStep < steps) {
                this._animationId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    stepDuration,
                    () => {
                        animate_step();
                        return GLib.SOURCE_REMOVE;
                    }
                );
            } else {
                // Animation complete - ensure exact final value
                this._currentSeconds = targetSeconds;
                this._updateLabel(targetSeconds);
                this._animationId = null;
            }
        };

        // Start animation
        animate_step();
    }

    /**
     * Update label text with formatted duration
     */
    _updateLabel(seconds) {
        if (!this.label || this.label.is_destroyed?.()) return;
        this.label.set_label(TimeUtils.formatDuration(seconds));
    }

    /**
     * Update without animation (direct set)
     * Used for regular tick updates (every second)
     */
    setDirect(seconds) {
        if (!this.label || this.label.is_destroyed?.()) return;
        this._currentSeconds = seconds;
        this._updateLabel(seconds);
    }

    /**
     * Cancel all animations
     */
    _cancelAnimation() {
        // Cancel rolling animation
        if (this._animationId) {
            GLib.Source.remove(this._animationId);
            this._animationId = null;
        }

        // Cancel pulse timeouts
        this._pulseTimeoutIds.forEach(id => GLib.Source.remove(id));
        this._pulseTimeoutIds = [];
    }

    /**
     * Destroy and cleanup
     * IMPORTANT: Call this when label is destroyed to prevent memory leaks
     */
    destroy() {
        this._cancelAnimation();
        this.label = null;
        this._currentSeconds = undefined;
    }

    /**
     * Get current animated value
     */
    getCurrentSeconds() {
        return this._currentSeconds;
    }
}

