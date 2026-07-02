import { Avatar, AvatarFallback } from "myra-agents";

export function Initials() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar>
        <AvatarFallback>VR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>CL</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>OC</AvatarFallback>
      </Avatar>
    </div>
  );
}
