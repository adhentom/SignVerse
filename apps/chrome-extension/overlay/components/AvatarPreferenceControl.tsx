import { AVATAR_PROFILES, type AvatarProfileId } from '../../playback/avatarProfiles';

export function AvatarPreferenceControl({
  selected,
  onChange,
}: {
  selected: AvatarProfileId;
  onChange(id: AvatarProfileId): void;
}) {
  return (
    <label className="sv-avatar-preference">
      <span>
        <strong>Interpreter</strong>
        <small>Choose the avatar used for ISL playback.</small>
      </span>
      <select
        aria-label="Interpreter avatar"
        onChange={(event) => onChange(event.currentTarget.value as AvatarProfileId)}
        value={selected}
      >
        {AVATAR_PROFILES.map((profile) => (
          <option key={profile.id} value={profile.id}>{profile.label}</option>
        ))}
      </select>
    </label>
  );
}
