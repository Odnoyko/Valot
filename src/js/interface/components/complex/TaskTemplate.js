/**
 * Task Template System - Provides predefined task templates for quick creation
 */
export class TaskTemplate {
    constructor() {
        this.templates = [
            {
                id: 'meeting',
                name: 'Meeting',
                icon: '🤝',
                fields: {
                    name: 'Team Meeting - [Date]',
                    description: 'Weekly team sync meeting\n- Review progress\n- Discuss blockers\n- Plan next steps',
                    estimatedHours: 1.0,
                    priority: 'medium',
                    tags: ['meeting', 'team', 'sync']
                }
            },
            {
                id: 'development',
                name: 'Development Task',
                icon: '💻',
                fields: {
                    name: 'Implement [Feature Name]',
                    description: '## Description\nImplement new feature for the application\n\n## Requirements\n- [ ] Requirement 1\n- [ ] Requirement 2\n- [ ] Requirement 3\n\n## Acceptance Criteria\n- [ ] Feature works as expected\n- [ ] Tests added\n- [ ] Documentation updated',
                    estimatedHours: 4.0,
                    priority: 'high',
                    tags: ['development', 'feature', 'coding']
                }
            },
            {
                id: 'bug-fix',
                name: 'Bug Fix',
                icon: '🐛',
                fields: {
                    name: 'Fix: [Bug Description]',
                    description: '## Bug Report\n**Issue:** Description of the bug\n**Steps to Reproduce:**\n1. Step 1\n2. Step 2\n3. Step 3\n\n**Expected Behavior:** What should happen\n**Actual Behavior:** What actually happens\n\n## Solution\n- [ ] Investigate root cause\n- [ ] Implement fix\n- [ ] Test fix\n- [ ] Verify no regression',
                    estimatedHours: 2.0,
                    priority: 'high',
                    tags: ['bug', 'fix', 'maintenance']
                }
            },
            {
                id: 'research',
                name: 'Research Task',
                icon: '🔍',
                fields: {
                    name: 'Research: [Topic]',
                    description: '## Research Objective\nInvestigate and analyze [topic]\n\n## Questions to Answer\n- Question 1?\n- Question 2?\n- Question 3?\n\n## Deliverables\n- [ ] Research summary\n- [ ] Recommendations\n- [ ] Next steps',
                    estimatedHours: 3.0,
                    priority: 'medium',
                    tags: ['research', 'analysis', 'investigation']
                }
            },
            {
                id: 'review',
                name: 'Code Review',
                icon: '👀',
                fields: {
                    name: 'Review: [PR/MR Title]',
                    description: '## Review Checklist\n- [ ] Code quality and style\n- [ ] Logic correctness\n- [ ] Performance considerations\n- [ ] Security implications\n- [ ] Test coverage\n- [ ] Documentation updates\n\n## Feedback\n[Add specific feedback here]',
                    estimatedHours: 1.0,
                    priority: 'medium',
                    tags: ['review', 'code-review', 'quality']
                }
            },
            {
                id: 'documentation',
                name: 'Documentation',
                icon: '📖',
                fields: {
                    name: 'Document: [Topic]',
                    description: '## Documentation Task\nCreate/update documentation for [topic]\n\n## Content to Cover\n- [ ] Overview\n- [ ] Usage examples\n- [ ] Configuration options\n- [ ] Troubleshooting\n- [ ] FAQs\n\n## Target Audience\n[Describe who will use this documentation]',
                    estimatedHours: 2.0,
                    priority: 'low',
                    tags: ['documentation', 'writing', 'knowledge-share']
                }
            },
            {
                id: 'testing',
                name: 'Testing Task',
                icon: '🧪',
                fields: {
                    name: 'Test: [Feature/Component]',
                    description: '## Testing Scope\nTest [feature/component] thoroughly\n\n## Test Cases\n- [ ] Unit tests\n- [ ] Integration tests\n- [ ] Edge cases\n- [ ] Error handling\n- [ ] Performance tests\n\n## Test Environment\n- [ ] Development\n- [ ] Staging\n- [ ] Production-like',
                    estimatedHours: 3.0,
                    priority: 'medium',
                    tags: ['testing', 'qa', 'validation']
                }
            },
            {
                id: 'deployment',
                name: 'Deployment',
                icon: '🚀',
                fields: {
                    name: 'Deploy: [Version/Release]',
                    description: '## Deployment Plan\nDeploy [version] to [environment]\n\n## Pre-deployment Checklist\n- [ ] Code reviewed and approved\n- [ ] Tests passing\n- [ ] Database migrations ready\n- [ ] Configuration updated\n- [ ] Rollback plan prepared\n\n## Post-deployment Checklist\n- [ ] Verify deployment success\n- [ ] Run smoke tests\n- [ ] Monitor logs\n- [ ] Update documentation',
                    estimatedHours: 1.5,
                    priority: 'high',
                    tags: ['deployment', 'release', 'devops']
                }
            },
            {
                id: 'planning',
                name: 'Planning Session',
                icon: '📋',
                fields: {
                    name: 'Planning: [Sprint/Project]',
                    description: '## Planning Session\nPlan work for [sprint/project]\n\n## Agenda\n- [ ] Review previous sprint\n- [ ] Estimate new tasks\n- [ ] Assign priorities\n- [ ] Set sprint goals\n- [ ] Identify blockers\n\n## Outcomes\n- Sprint backlog defined\n- Team capacity planned\n- Goals communicated',
                    estimatedHours: 2.0,
                    priority: 'medium',
                    tags: ['planning', 'sprint', 'organization']
                }
            },
            {
                id: 'client-call',
                name: 'Client Call',
                icon: '📞',
                fields: {
                    name: 'Call: [Client Name] - [Purpose]',
                    description: '## Call Details\n**Client:** [Client Name]\n**Purpose:** [Call purpose]\n**Date/Time:** [Schedule]\n\n## Agenda\n- [ ] Item 1\n- [ ] Item 2\n- [ ] Item 3\n\n## Follow-up Actions\n- [ ] Action 1\n- [ ] Action 2\n- [ ] Send meeting summary',
                    estimatedHours: 1.0,
                    priority: 'medium',
                    tags: ['client', 'call', 'communication']
                }
            }
        ];
    }

    /**
     * Get all available templates
     */
    getAllTemplates() {
        return this.templates;
    }

    /**
     * Get template by ID
     */
    getTemplate(templateId) {
        return this.templates.find(template => template.id === templateId);
    }

    /**
     * Get templates by category/tag
     */
    getTemplatesByTag(tag) {
        return this.templates.filter(template => 
            template.fields.tags && template.fields.tags.includes(tag)
        );
    }

    /**
     * Create a task from template with custom replacements
     */
    createTaskFromTemplate(templateId, replacements = {}) {
        const template = this.getTemplate(templateId);
        if (!template) {
            throw new Error(`Template with ID '${templateId}' not found`);
        }

        const task = { ...template.fields };

        // Apply replacements to name and description
        Object.keys(replacements).forEach(key => {
            const placeholder = `[${key}]`;
            if (task.name.includes(placeholder)) {
                task.name = task.name.replace(new RegExp(`\\[${key}\\]`, 'g'), replacements[key]);
            }
            if (task.description.includes(placeholder)) {
                task.description = task.description.replace(new RegExp(`\\[${key}\\]`, 'g'), replacements[key]);
            }
        });

        return {
            templateId,
            templateName: template.name,
            templateIcon: template.icon,
            ...task,
            createdAt: new Date().toISOString(),
            createdFromTemplate: true
        };
    }

    /**
     * Add custom template
     */
    addCustomTemplate(template) {
        // Validate template structure
        if (!template.id || !template.name || !template.fields) {
            throw new Error('Template must have id, name, and fields properties');
        }

        // Check if template ID already exists
        if (this.getTemplate(template.id)) {
            throw new Error(`Template with ID '${template.id}' already exists`);
        }

        this.templates.push(template);
    }

    /**
     * Get template categories
     */
    getCategories() {
        const categories = new Set();
        this.templates.forEach(template => {
            if (template.fields.tags) {
                template.fields.tags.forEach(tag => categories.add(tag));
            }
        });
        return Array.from(categories).sort();
    }

    /**
     * Search templates by name or tag
     */
    searchTemplates(query) {
        const lowerQuery = query.toLowerCase();
        return this.templates.filter(template => 
            template.name.toLowerCase().includes(lowerQuery) ||
            template.fields.name.toLowerCase().includes(lowerQuery) ||
            (template.fields.tags && template.fields.tags.some(tag => 
                tag.toLowerCase().includes(lowerQuery)
            ))
        );
    }
}

// Export singleton instance
export const taskTemplateManager = new TaskTemplate();