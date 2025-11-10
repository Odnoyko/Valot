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
     * @param {string} prefix - Optional prefix to add before duration (e.g. "● " for tracked tasks)
     */
    constructor(label, prefix = '') {
        this.label = label;
        this.prefix = prefix;
        this._currentSeconds = undefined;
        this._animationId = null;
        this._animationTarget = null;
        this._pulseTimeoutIds = [];
    }

    /**
     * Animate to new duration value
     * @param {number} targetSeconds - Target duration in seconds
     * @param {boolean} animate - Whether to animate transition (true) or instant update (false)
     * @param {number} fromSeconds - Optional: start value for animation (if not set, uses current value)
     */
    animateTo(targetSeconds, animate = true, fromSeconds = null) {
        if (!this.label || this.label.is_destroyed?.()) return;

        // Cancel any existing animation
        this._cancelAnimation();

        // Determine start value for animation
        let startSeconds;
        if (fromSeconds !== null && fromSeconds !== undefined) {
            // Use explicitly provided start value
            startSeconds = fromSeconds;
            this._currentSeconds = fromSeconds;
        } else if (this._currentSeconds !== undefined) {
            // Use stored current value
            startSeconds = this._currentSeconds;
        } else {
            // First time - start from target (no animation)
            this._currentSeconds = targetSeconds;
            this._updateLabel(targetSeconds);
            this._showPulseEffect(); // Just show pulse, no rolling
            return;
        }

        const delta = targetSeconds - startSeconds;

        // Always show visual pulse effect BEFORE animation starts
        this._showPulseEffect();

        // For small changes or disabled animation, just update (pulse already shown)
        if (!animate || Math.abs(delta) < 2) {
            this._currentSeconds = targetSeconds;
            this._updateLabel(targetSeconds);
            return;
        }

        // Start rolling counter animation from startSeconds to targetSeconds
        this._startRollingAnimation(startSeconds, targetSeconds);
    }

    /**
     * Show visual pulse/glitch effect
     * Quick opacity flicker for visual feedback
     */
    _showPulseEffect() {
        if (!this.label || this.label.is_destroyed?.()) return;

        // Cancel any existing pulse timeouts (safely)
        this._cancelPulseTimeouts();

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
                // Auto-remove from tracking when complete
                this._pulseTimeoutIds = this._pulseTimeoutIds.filter(id => id !== timeoutId);
                return GLib.SOURCE_REMOVE;
            });
            this._pulseTimeoutIds.push(timeoutId);
        });
    }

    /**
     * Cancel pulse timeouts safely
     * Only removes timeouts that haven't completed yet
     */
    _cancelPulseTimeouts() {
        this._pulseTimeoutIds.forEach(id => {
            try {
                GLib.Source.remove(id);
            } catch (e) {
                // Timeout already completed, ignore
            }
        });
        this._pulseTimeoutIds = [];
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

        // Store initial target (may be updated by setDirect() during animation)
        this._animationTarget = targetSeconds;

        // Easing function (ease-out cubic)
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        // Animation loop
        const animate_step = () => {
            // Check if label still exists
            if (!this.label || this.label.is_destroyed?.()) {
                this._animationId = null;
                this._animationTarget = null;
                return;
            }

            currentStep++;
            const progress = currentStep / steps;
            const easedProgress = easeOutCubic(progress);

            // Calculate current value (use updated target if it changed)
            const currentTarget = this._animationTarget || targetSeconds;
            const currentDelta = currentTarget - startSeconds;
            const currentSeconds = Math.floor(startSeconds + currentDelta * easedProgress);
            
            // Update label with interpolated value
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
                // Animation complete - use final target value (may have been updated during animation)
                const finalTarget = this._animationTarget || targetSeconds;
                this._currentSeconds = finalTarget;
                this._updateLabel(finalTarget);
                this._animationId = null;
                this._animationTarget = null;
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
        const formattedTime = TimeUtils.formatDuration(seconds);
        this.label.set_label(this.prefix + formattedTime);
    }

    /**
     * Update without animation (direct set)
     * Used for regular tick updates (every second)
     * @param {number} seconds - Target duration in seconds
     * @param {boolean} showPulse - Whether to show pulse effect (default: false for regular ticks)
     */
    setDirect(seconds, showPulse = false) {
        if (!this.label || this.label.is_destroyed?.()) return;
        
        // CRITICAL: If rolling animation is in progress, just update target value
        // Don't interrupt the animation, let it reach the new target smoothly
        if (this._animationId && this._animationTarget !== undefined) {
            // Animation in progress - update animation target to new value
            // This allows animation to smoothly transition to the updated target
            this._animationTarget = seconds;
            return;
        }
        
        // No animation in progress - update directly
        this._currentSeconds = seconds;
        this._updateLabel(seconds);
        
        // Optionally show pulse effect (e.g., when value changes significantly)
        if (showPulse) {
            this._showPulseEffect();
        }
    }

    /**
     * Cancel all animations
     */
    _cancelAnimation() {
        // Cancel rolling animation (safely)
        if (this._animationId) {
            try {
                GLib.Source.remove(this._animationId);
            } catch (e) {
                // Timeout already completed, ignore
            }
            this._animationId = null;
            this._animationTarget = null;
        }

        // Cancel pulse timeouts
        this._cancelPulseTimeouts();
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
    
    /**
     * Update prefix (e.g., add/remove green dot for tracking)
     */
    setPrefix(prefix) {
        this.prefix = prefix;
        // Update label with new prefix if we have a current value
        if (this._currentSeconds !== undefined) {
            this._updateLabel(this._currentSeconds);
        }
    }
    
    /**
     * Reset animator state (for dialog reuse)
     * Clears current value so next animateTo() will start fresh
     */
    reset() {
        this._cancelAnimation();
        this._currentSeconds = undefined;
        this._animationTarget = null;
    }
}

