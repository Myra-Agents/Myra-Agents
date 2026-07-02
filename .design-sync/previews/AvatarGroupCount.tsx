import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "myra-agents";

export function OverflowCount() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>VR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>CL</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+8</AvatarGroupCount>
    </AvatarGroup>
  );
}
