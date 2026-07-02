import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "myra-agents";

const AGENT_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='%234f46e5'/><text x='40' y='52' font-size='36' fill='white' text-anchor='middle' font-family='sans-serif'>MA</text></svg>";

export function Single() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar>
        <AvatarImage src={AGENT_IMG} alt="Myra agent" />
        <AvatarFallback>MA</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>VR</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar size="sm">
        <AvatarFallback>sm</AvatarFallback>
      </Avatar>
      <Avatar size="default">
        <AvatarFallback>md</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>lg</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function WithStatus() {
  return (
    <Avatar size="lg">
      <AvatarFallback>CL</AvatarFallback>
      <AvatarBadge />
    </Avatar>
  );
}
