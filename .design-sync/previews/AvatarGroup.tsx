import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "myra-agents";

export function Assignees() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>VR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>CL</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>OC</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+3</AvatarGroupCount>
    </AvatarGroup>
  );
}
