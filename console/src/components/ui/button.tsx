import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { buttonVariants } from './button-variants';

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  React.ComponentProps<typeof buttonVariants> & {
    asChild?: boolean;
    href?: string;
  }) {
  const Comp = asChild ? Slot : 'button';
  const navigate = useNavigate();
  return (
    <Comp
      onClick={(e) => {
        if (props.href) {
          e.preventDefault();
          navigate(props.href);
        }
      }}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
