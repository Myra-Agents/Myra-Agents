import { Avatar, AvatarBadge, AvatarFallback } from "myra-agents";

export function OnlineStatus() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar size="lg">
        <AvatarFallback>CL</AvatarFallback>
        <AvatarBadge />
      </Avatar>
      <Avatar>
        <AvatarFallback>VR</AvatarFallback>
        <AvatarBadge className="bg-green-500" />
      </Avatar>
    </div>
  );
}
