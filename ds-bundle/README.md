# MyraUI (myra-agents@0.3.1)

This design system is the published myra-agents React library, bundled as a single
browser global. All 299 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.MyraUI`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.MyraUI.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { Accordion } = window.MyraUI;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<Accordion />);
```

## Tokens

252 CSS custom properties from myra-agents. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (78): `--tw-border-style`, `--tw-shadow-color`, `--tw-inset-shadow-color`, …
- **spacing** (6): `--tw-space-y-reverse`, `--tw-space-x-reverse`, `--tw-inset-shadow`, …
- **typography** (13): `--tw-font-weight`, `--tw-tracking`, `--font-sans`, …
- **radius** (6): `--radius-md`, `--cell-radius`, `--radius`, …
- **shadow** (14): `--tw-shadow`, `--tw-shadow-alpha`, `--tw-ring-shadow`, …
- **other** (135): `--tw-translate-x`, `--tw-translate-y`, `--tw-translate-z`, …

## Components

### general
- `Accordion`
- `AccordionContent`
- `AccordionItem`
- `AccordionTrigger`
- `Alert`
- `AlertAction`
- `AlertDescription`
- `AlertDialog`
- `AlertDialogAction`
- `AlertDialogCancel`
- `AlertDialogContent`
- `AlertDialogDescription`
- `AlertDialogFooter`
- `AlertDialogHeader`
- `AlertDialogMedia`
- `AlertDialogOverlay`
- `AlertDialogPortal`
- `AlertDialogTitle`
- `AlertDialogTrigger`
- `AlertTitle`
- `AspectRatio`
- `Avatar`
- `AvatarBadge`
- `AvatarFallback`
- `AvatarGroup`
- `AvatarGroupCount`
- `AvatarImage`
- `Badge`
- `Breadcrumb`
- `BreadcrumbEllipsis`
- `BreadcrumbItem`
- `BreadcrumbLink`
- `BreadcrumbList`
- `BreadcrumbPage`
- `BreadcrumbSeparator`
- `Button`
- `ButtonGroup`
- `ButtonGroupSeparator`
- `ButtonGroupText`
- `Calendar`
- `CalendarDayButton`
- `Card`
- `CardAction`
- `CardContent`
- `CardDescription`
- `CardFooter`
- `CardHeader`
- `CardTitle`
- `Carousel`
- `CarouselContent`
- `CarouselItem`
- `CarouselNext`
- `CarouselPrevious`
- `ChartContainer`
- `ChartLegend`
- `ChartLegendContent`
- `ChartStyle`
- `ChartTooltip`
- `ChartTooltipContent`
- `Checkbox`
- `Collapsible`
- `CollapsibleContent`
- `CollapsibleTrigger`
- `Combobox`
- `ComboboxChip`
- `ComboboxChips`
- `ComboboxChipsInput`
- `ComboboxCollection`
- `ComboboxContent`
- `ComboboxEmpty`
- `ComboboxGroup`
- `ComboboxInput`
- `ComboboxItem`
- `ComboboxLabel`
- `ComboboxList`
- `ComboboxSeparator`
- `ComboboxTrigger`
- `ComboboxValue`
- `Command`
- `CommandDialog`
- `CommandEmpty`
- `CommandGroup`
- `CommandInput`
- `CommandItem`
- `CommandList`
- `CommandSeparator`
- `CommandShortcut`
- `ContextMenu`
- `ContextMenuCheckboxItem`
- `ContextMenuContent`
- `ContextMenuGroup`
- `ContextMenuItem`
- `ContextMenuLabel`
- `ContextMenuPortal`
- `ContextMenuRadioGroup`
- `ContextMenuRadioItem`
- `ContextMenuSeparator`
- `ContextMenuShortcut`
- `ContextMenuSub`
- `ContextMenuSubContent`
- `ContextMenuSubTrigger`
- `ContextMenuTrigger`
- `Dialog`
- `DialogClose`
- `DialogContent`
- `DialogDescription`
- `DialogFooter`
- `DialogHeader`
- `DialogOverlay`
- `DialogPortal`
- `DialogTitle`
- `DialogTrigger`
- `DirectionProvider`
- `Drawer`
- `DrawerClose`
- `DrawerContent`
- `DrawerDescription`
- `DrawerFooter`
- `DrawerHeader`
- `DrawerOverlay`
- `DrawerPortal`
- `DrawerTitle`
- `DrawerTrigger`
- `DropdownMenu`
- `DropdownMenuCheckboxItem`
- `DropdownMenuContent`
- `DropdownMenuGroup`
- `DropdownMenuItem`
- `DropdownMenuLabel`
- `DropdownMenuPortal`
- `DropdownMenuRadioGroup`
- `DropdownMenuRadioItem`
- `DropdownMenuSeparator`
- `DropdownMenuShortcut`
- `DropdownMenuSub`
- `DropdownMenuSubContent`
- `DropdownMenuSubTrigger`
- `DropdownMenuTrigger`
- `Empty`
- `EmptyContent`
- `EmptyDescription`
- `EmptyHeader`
- `EmptyMedia`
- `EmptyTitle`
- `Field`
- `FieldContent`
- `FieldDescription`
- `FieldError`
- `FieldGroup`
- `FieldLabel`
- `FieldLegend`
- `FieldSeparator`
- `FieldSet`
- `FieldTitle`
- `HoverCard`
- `HoverCardContent`
- `HoverCardTrigger`
- `Input`
- `InputGroup`
- `InputGroupAddon`
- `InputGroupButton`
- `InputGroupInput`
- `InputGroupText`
- `InputGroupTextarea`
- `InputOTP`
- `InputOTPGroup`
- `InputOTPSeparator`
- `InputOTPSlot`
- `Item`
- `ItemActions`
- `ItemContent`
- `ItemDescription`
- `ItemFooter`
- `ItemGroup`
- `ItemHeader`
- `ItemMedia`
- `ItemSeparator`
- `ItemTitle`
- `Kbd`
- `KbdGroup`
- `Label`
- `Menubar`
- `MenubarCheckboxItem`
- `MenubarContent`
- `MenubarGroup`
- `MenubarItem`
- `MenubarLabel`
- `MenubarMenu`
- `MenubarPortal`
- `MenubarRadioGroup`
- `MenubarRadioItem`
- `MenubarSeparator`
- `MenubarShortcut`
- `MenubarSub`
- `MenubarSubContent`
- `MenubarSubTrigger`
- `MenubarTrigger`
- `MyraLoader`
- `MyraThinking`
- `NativeSelect`
- `NativeSelectOptGroup`
- `NativeSelectOption`
- `NavigationMenu`
- `NavigationMenuContent`
- `NavigationMenuIndicator`
- `NavigationMenuItem`
- `NavigationMenuLink`
- `NavigationMenuList`
- `NavigationMenuTrigger`
- `NavigationMenuViewport`
- `Pagination`
- `PaginationContent`
- `PaginationEllipsis`
- `PaginationItem`
- `PaginationLink`
- `PaginationNext`
- `PaginationPrevious`
- `Popover`
- `PopoverAnchor`
- `PopoverContent`
- `PopoverDescription`
- `PopoverHeader`
- `PopoverTitle`
- `PopoverTrigger`
- `Progress`
- `RadioGroup`
- `RadioGroupItem`
- `ResizableHandle`
- `ResizablePanel`
- `ResizablePanelGroup`
- `ScrollArea`
- `ScrollBar`
- `Select`
- `SelectContent`
- `SelectGroup`
- `SelectItem`
- `SelectLabel`
- `SelectScrollDownButton`
- `SelectScrollUpButton`
- `SelectSeparator`
- `SelectTrigger`
- `SelectValue`
- `Separator`
- `Sheet`
- `SheetClose`
- `SheetContent`
- `SheetDescription`
- `SheetFooter`
- `SheetHeader`
- `SheetTitle`
- `SheetTrigger`
- `Sidebar`
- `SidebarContent`
- `SidebarFooter`
- `SidebarGroup`
- `SidebarGroupAction`
- `SidebarGroupContent`
- `SidebarGroupLabel`
- `SidebarHeader`
- `SidebarInput`
- `SidebarInset`
- `SidebarMenu`
- `SidebarMenuAction`
- `SidebarMenuBadge`
- `SidebarMenuButton`
- `SidebarMenuItem`
- `SidebarMenuSkeleton`
- `SidebarMenuSub`
- `SidebarMenuSubButton`
- `SidebarMenuSubItem`
- `SidebarProvider`
- `SidebarRail`
- `SidebarSeparator`
- `SidebarTrigger`
- `Skeleton`
- `Slider`
- `Spinner`
- `Switch`
- `Table`
- `TableBody`
- `TableCaption`
- `TableCell`
- `TableFooter`
- `TableHead`
- `TableHeader`
- `TableRow`
- `Tabs`
- `TabsContent`
- `TabsList`
- `TabsTrigger`
- `Textarea`
- `Toaster`
- `Toggle`
- `ToggleGroup`
- `ToggleGroupItem`
- `Tooltip`
- `TooltipContent`
- `TooltipProvider`
- `TooltipTrigger`
