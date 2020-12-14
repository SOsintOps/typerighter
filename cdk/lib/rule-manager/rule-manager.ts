// TODO: How do we want to do imports for both our own components and cdk?
import { HealthCheck } from "@aws-cdk/aws-autoscaling";
import { ApplicationProtocol, ListenerAction, Protocol, TargetType } from "@aws-cdk/aws-elasticloadbalancingv2";
import type { App } from "@aws-cdk/core";
import { Duration, Tags } from "@aws-cdk/core";
import { InstanceRole } from "@guardian/cdk";
import { GuAutoScalingGroup } from "@guardian/cdk/lib/constructs/autoscaling";
import {
  GuArnParameter,
  GuParameter,
  GuSSMParameter,
  GuStringParameter,
  GuSubnetListParameter,
  GuVpcParameter,
} from "@guardian/cdk/lib/constructs/core";
import type { GuStackProps } from "@guardian/cdk/lib/constructs/core/stack";
import { GuStack } from "@guardian/cdk/lib/constructs/core/stack";
import { GuSecurityGroup, GuVpc } from "@guardian/cdk/lib/constructs/ec2";
import {
  GuApplicationListener,
  GuApplicationLoadBalancer,
  GuApplicationTargetGroup,
} from "@guardian/cdk/lib/constructs/loadbalancing";

// TODO: Can we pass app in as a prop?
// TODO: Can we do the same for Stage and Stack? How does that work if sometimes they're
//       parameters and other times they're hardcoded
// TODO: Setup snapshot tests to give us diffs when things change
// TODO: 
export class RuleManager extends GuStack {
  constructor(scope: App, id: string, props?: GuStackProps) {
    super(scope, id, props);

    const parameters = {
      VPC: new GuVpcParameter(this, "VPC", {
        description: "Virtual Private Cloud to run EC2 instances within",
      }),
      PublicSubnets: new GuSubnetListParameter(this, "PublicSubnets", {
        description: "Subnets to run load balancer within",
      }),
      PrivateSubnets: new GuSubnetListParameter(this, "PrivateSubnets", {
        description: "Subnets to run the ASG and instances within",
      }),
      TLSCert: new GuArnParameter(this, "TLSCert", {
        description: "ARN of a TLS certificate to install on the load balancer",
      }),
      AMI: new GuStringParameter(this, "AMI", {
        description: "AMI ID",
      }),
      ClusterName: new GuStringParameter(this, "ClusterName", {
        description: "The value of the ElasticSearchCluster tag that this instance should join",
        default: "elk",
      }),
    };

    Tags.of(this).add("ElasticSearchCluster", parameters.ClusterName.valueAsString);

    const vpc = GuVpc.fromId(this, "vpc", parameters.VPC.valueAsString);

    const ruleManagerRole = new InstanceRole(this, {
      artifactBucket: "composer-dist"
    });

    const targetGroup = new GuApplicationTargetGroup(this, "InternalTargetGroup", {
      vpc: vpc,
      port: 3000,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.INSTANCE,
      healthCheck: {
        port: "3000",
        protocol: Protocol.HTTP,
        path: "/api/health",
        interval: Duration.minutes(1),
        timeout: Duration.seconds(3),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      },
      deregistrationDelay: Duration.seconds(30),
    });

    // TODO: we should be able to remove this, as the consuming code should be able to provide a default
    const loadBalancerSecurityGroup = new GuSecurityGroup(this, "LoadBalancerSecurityGroup", {
      description: "Guardian IP range has access to the load balancer on port 80",
      vpc: vpc,
      allowAllOutbound: false
    });

    const subnets = GuVpc.subnets(this, parameters.PrivateSubnets.valueAsList);

    const loadBalancer = new GuApplicationLoadBalancer(this, "InternalLoadBalancer", {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnets },
      securityGroup: loadBalancerSecurityGroup,
    });

    new GuApplicationListener(this, "InternalListener", {
      loadBalancer,
      certificates: [{ certificateArn: parameters.TLSCert.valueAsString }],
      defaultAction: ListenerAction.forward([targetGroup]),
      open: false,
    });

    // TODO: we should be able to remove this, as the consuming code should be able to provide a default
    const appSecurityGroup = new GuSecurityGroup(this, "ApplicationSecurityGroup", {
      description: "HTTP",
      vpc,
      allowAllOutbound: true,
    });

    const userData = `#!/bin/bash -ev`;

    // TODO: ASG used to have `AvailabilityZones: !GetAZs ''`
    // TODO: Maybe there's a nicer way of doing the security groups than this
    new GuAutoScalingGroup(this, "AutoscalingGroup", {
      vpc,
      vpcSubnets: { subnets },
      role: ruleManagerRole,
      imageId: parameters.AMI.valueAsString,
      userData: userData,
      instanceType: "t3.micro",
      minCapacity: 1,
      maxCapacity: 2,
      healthCheck: HealthCheck.elb({
        grace: Duration.minutes(5),
      }),
      targetGroup,
      securityGroup: appSecurityGroup,
      associatePublicIpAddress: false,
    });
  }
}