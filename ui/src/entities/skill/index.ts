export {
  listSkills, getSkill, createSkill, updateSkill, deleteSkill, searchSkills, bumpSkillUsage,
  listSkillRelations, createSkillLink, deleteSkillLink, findLinkedSkills,
  listSkillAttachments, uploadSkillAttachment, deleteSkillAttachment, skillAttachmentUrl,
  type Skill, type SkillSearchResult, type SkillRelation, type AttachmentMeta,
} from './api.ts';
export {
  SOURCE_COLORS, SOURCE_BADGE_COLOR, sourceLabel, confidenceLabel,
} from './config.ts';
export { SkillCard } from './SkillCard.tsx';
