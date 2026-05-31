"use client";

import { useState, ReactNode, useEffect } from "react";
import { useForm, FieldValues, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface FormFieldConfig {
  name: string;
  label: string;
  type: "text" | "select" | "number" | "date" | "textarea" | "info";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  value?: string | number; // For info fields to display dynamic values
  onChangeEffect?: (value: any, ctx: {
    mode: "create" | "edit";
    setValue: (name: string, value: any) => void;
    invokeOnFieldChange: (name: string, value: any) => void;
    getValues: () => any;
  }) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  addon?: React.ReactNode | ((form: import("react-hook-form").UseFormReturn<any>) => React.ReactNode);
  addonBelow?: React.ReactNode | ((form: import("react-hook-form").UseFormReturn<any>) => React.ReactNode);
}

interface FormDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  schema: z.ZodObject<any>;
  fields: FormFieldConfig[];
  defaultValues: Record<string, any>;
  onSubmit: (data: any) => Promise<void>;
  submitLabel?: string;
  isLoading?: boolean;
  mode?: "create" | "edit";
  initialData?: Record<string, any>;
  onFieldChange?: (fieldName: string, value: any, currentValues: Record<string, any>) => void;
  contentClassName?: string; // Optional className for DialogContent customization
}

export function FormDialog({
  trigger,
  title,
  description,
  schema,
  fields,
  defaultValues,
  onSubmit,
  submitLabel = "Create",
  isLoading = false,
  mode = "create",
  initialData,
  onFieldChange,
  contentClassName,
}: FormDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>("");
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});

  const form = useForm({
    resolver: zodResolver(schema) as any,
    defaultValues: mode === "edit" && initialData ? initialData : defaultValues,
  });

  // Reset form only when dialog opens or mode changes (not on defaultValues updates)
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initialData) {
      form.reset(initialData);
    } else if (mode === "create") {
      form.reset(defaultValues);
    }
    // Intentionally omit defaultValues from deps to avoid mid-typing resets
  }, [open, mode, initialData]);

  // Update key form values when defaults change while dialog is open
  useEffect(() => {
    if (open && mode === "create") {
      const currentValues: Record<string, any> = form.getValues();
      // Sync key defaults but avoid overriding while user is typing for numeric fields
      const keysToSync = ['vehicleId', 'startKm', 'endKm', 'fuelQuantity', 'remainingFuelQuantity'];

      keysToSync.forEach((key) => {
        if (key in defaultValues) {
          const newVal = (defaultValues as any)[key];
          const curVal = currentValues[key];
          // Don't clobber user input for numeric fields mid-typing
          const isNumericField = key === 'startKm' || key === 'endKm' || key === 'fuelQuantity';
          const fieldState = form.getFieldState(key as any);
          const userIsEditing = fieldState.isDirty || fieldState.isTouched;
          const shouldUpdate = isNumericField ? (!userIsEditing && newVal !== curVal) : (newVal !== curVal);
          if (shouldUpdate) {
            form.setValue(key as any, newVal, {
              shouldDirty: true,
              shouldTouch: false,
              shouldValidate: false,
            });
          }
        }
      });
    }
  }, [defaultValues, open, mode, form]);

  const handleSubmit: SubmitHandler<FieldValues> = async (data) => {
    try {
      setError("");
      await onSubmit(data);
      setOpen(false);
      // Always reset to defaultValues after successful submission
      form.reset(defaultValues);
    } catch (error: any) {
      setError(error.message || "An error occurred");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset to defaultValues when closing dialog
      form.reset(defaultValues);
      setError("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={`sm:max-w-[600px] ${contentClassName || ""}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((field) => (
                field.type === "info" ? (
                  <div
                    key={field.name}
                    className="md:col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-md"
                  >
                    <div className="text-sm font-medium text-blue-800 mb-1">
                      {field.label}
                    </div>
                    <div className="text-sm text-blue-600">
                      {field.value || "No information available"}
                    </div>
                  </div>
                ) : (
                  <FormField
                    key={field.name}
                    control={form.control}
                    name={field.name}
                    render={({ field: formField }) => (
                      <FormItem
                        className={
                          field.type === "select" && field.name === "status"
                            ? "md:col-span-2"
                            : ""
                        }
                      >
                        <FormLabel>{field.label}</FormLabel>
                        <div className="flex gap-2 w-full items-start">
                          <div className="flex-1 w-full">
                            <FormControl>
                              {field.type === "select" ? (
                            <Select
                              onValueChange={(value) => {
                                formField.onChange(value);
                                if (onFieldChange) {
                                  onFieldChange(field.name, value, form.getValues());
                                }
                                if (field.onChangeEffect) {
                                  field.onChangeEffect(value, {
                                    mode,
                                    setValue: (name: string, val: any) =>
                                      form.setValue(name as any, val, {
                                        shouldDirty: true,
                                        shouldTouch: true,
                                        shouldValidate: false,
                                      }),
                                    invokeOnFieldChange: (name: string, val: any) =>
                                      onFieldChange?.(name, val, form.getValues()),
                                    getValues: form.getValues,
                                  });
                                }
                              }}
                              value={formField.value}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={field.placeholder} />
                              </SelectTrigger>
                              <SelectContent>
                                {field.searchable ? (
                                  <div className="p-2">
                                    <Input
                                      placeholder={field.searchPlaceholder || "Search..."}
                                      value={searchQueries[field.name] || ""}
                                      onChange={(e) =>
                                        setSearchQueries((prev) => ({
                                          ...prev,
                                          [field.name]: e.target.value,
                                        }))
                                      }
                                      className="h-8"
                                    />
                                  </div>
                                ) : null}
                                {(field.options || [])
                                  .filter((option) => {
                                    const q = (searchQueries[field.name] || "").trim().toLowerCase();
                                    if (!q) return true;
                                    return (option.label || "").toLowerCase().includes(q);
                                  })
                                  .map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : field.type === "textarea" ? (
                            <Textarea
                              placeholder={field.placeholder}
                              {...formField}
                            />
                          ) : (
                            <Input
                              type={field.type}
                              placeholder={field.placeholder}
                              {...formField}
                              onChange={(
                                e: React.ChangeEvent<HTMLInputElement>
                              ) => {
                                const value =
                                  field.type === "number"
                                    ? Number(e.target.value)
                                    : e.target.value;
                                formField.onChange(value);
                                if (onFieldChange) {
                                  onFieldChange(field.name, value, form.getValues());
                                }
                                if (field.onChangeEffect) {
                                  field.onChangeEffect(value, {
                                    mode,
                                    setValue: (name: string, val: any) =>
                                      form.setValue(name as any, val, {
                                        shouldDirty: true,
                                        shouldTouch: true,
                                        shouldValidate: false,
                                      }),
                                    invokeOnFieldChange: (name: string, val: any) =>
                                      onFieldChange?.(name, val, form.getValues()),
                                    getValues: form.getValues,
                                  });
                                }
                              }}
                            />
                          )}
                            </FormControl>
                          </div>
                          {field.addon && <div className="shrink-0">{typeof field.addon === 'function' ? field.addon(form) : field.addon}</div>}
                        </div>
                        {field.addonBelow && <div className="w-full mt-2">{typeof field.addonBelow === 'function' ? field.addonBelow(form) : field.addonBelow}</div>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )
              ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? mode === "edit"
                    ? "Updating..."
                    : "Creating..."
                  : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
